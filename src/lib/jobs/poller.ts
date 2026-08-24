import { prisma } from "@/lib/prisma";
import { getVideoProvider, isProviderName, SUPPORTED_PROVIDERS } from "@/lib/video-provider";
import { RetryableProviderError, TerminalProviderError } from "@/lib/video-provider/types";
import { logProviderError } from "@/lib/video-provider/provider-log";
import { completeJob, failJob } from "./job-service";

let started = false;

const DEFAULT_STUCK_TIMEOUT_MS = 60 * 60 * 1000;

/** 1tickで問い合わせるジョブの上限。外部APIへの同時アクセスが際限なく増えないようにする。 */
const PROCESSING_BATCH_LIMIT = 50;

/**
 * このコンテナが処理できるプロバイダのジョブだけを対象にする条件。
 *
 * ローリングデプロイ中は、新しいプロバイダを知らない旧コンテナが動き続ける。
 * provider で絞らないと、旧コンテナが新プロバイダのジョブを自分の知っているAPIへ
 * 問い合わせて失敗させ、まだ生成中のタスクにクレジットを返還してしまう
 * (外部では生成と課金が続くため二重の損失になる)。知らないproviderのジョブは
 * 失敗させずそのまま放置し、対応できるコンテナに任せる。
 */
const supportedProviderFilter = { provider: { in: [...SUPPORTED_PROVIDERS] } };

/**
 * 進行が止まったまま放置されたジョブを失敗として確定させ、クレジットを返還する。
 *
 * プロバイダのステータス取得が恒常的に失敗する、生成物のダウンロードに失敗し続ける、
 * submit直後にプロセスが落ちてPENDINGのまま残る、といった経路では
 * プロバイダから"failed"が返らないため、放置するとスタッフの残高が減ったままになる。
 * 一定時間を超えた未完了ジョブは失敗扱いにして必ず残高へ戻す。
 */
export async function failStuckJobs(timeoutMs: number) {
  const threshold = new Date(Date.now() - timeoutMs);
  const stuckJobs = await prisma.generationJob.findMany({
    where: {
      status: { in: ["PENDING", "PROCESSING"] },
      ...supportedProviderFilter,
      OR: [
        { startedAt: { lt: threshold } },
        { startedAt: null, createdAt: { lt: threshold } },
      ],
    },
  });

  for (const job of stuckJobs) {
    try {
      await failJob(
        job.id,
        `生成が${Math.round(timeoutMs / 60000)}分以内に完了しなかったため失敗として扱いました`
      );
      console.warn(`[poller] job ${job.id} timed out and was refunded`);
    } catch (err) {
      console.error(`[poller] job ${job.id} timeout handling failed`, err);
    }
  }
}

async function syncJob(job: {
  id: string;
  provider: string;
  providerJobId: string | null;
}) {
  if (!job.providerJobId) return;
  if (!isProviderName(job.provider)) return;

  try {
    const result = await getVideoProvider(job.provider).getStatus(job.providerJobId);
    if (result.status === "completed") {
      await completeJob(job.id, result);
    } else if (result.status === "failed") {
      await failJob(
        job.id,
        result.errorMessage ?? "生成に失敗しました",
        result.errorCode
      );
    }
  } catch (err) {
    if (err instanceof RetryableProviderError) {
      // 一時的な失敗。ジョブはPROCESSINGのまま残し、次tickで再確認する。
      logProviderError("status", err.detail);
      return;
    }
    if (err instanceof TerminalProviderError) {
      await failJob(job.id, err.userMessage, err.detail.errorCode);
      return;
    }
    console.error(`[poller] job ${job.id} status check failed`, err);
  }
}

/**
 * PROCESSING状態のジョブをポーリングしてプロバイダの状態と同期する。
 * デプロイ再起動後もDBに永続化されたPROCESSINGジョブを自動的に拾うため、
 * ジョブの取りこぼしは発生しない。
 */
export function startGenerationPoller() {
  if (started) return;
  started = true;

  const intervalMs = Number(process.env.GENERATION_POLL_INTERVAL_MS ?? 10000);
  const stuckTimeoutMs = Number(
    process.env.GENERATION_STUCK_TIMEOUT_MS ?? DEFAULT_STUCK_TIMEOUT_MS
  );

  // setInterval のコールバックが async なので、前回のtickが終わる前に次が始まりうる。
  // 生成物のダウンロード・アップロードは条件付き更新より前に走るため、重なると
  // 同じ動画を二重にダウンロード・アップロードしてしまう。
  let ticking = false;

  setInterval(async () => {
    if (ticking) return;
    ticking = true;
    try {
      let processingJobs;
      try {
        processingJobs = await prisma.generationJob.findMany({
          where: { status: "PROCESSING", ...supportedProviderFilter },
          orderBy: { startedAt: "asc" },
          take: PROCESSING_BATCH_LIMIT,
        });
      } catch (err) {
        console.error("[poller] failed to fetch processing jobs", err);
        return;
      }

      for (const job of processingJobs) {
        await syncJob(job);
      }

      try {
        await failStuckJobs(stuckTimeoutMs);
      } catch (err) {
        console.error("[poller] failed to sweep stuck jobs", err);
      }
    } finally {
      ticking = false;
    }
  }, intervalMs);

  console.log(
    `[poller] generation poller started (interval=${intervalMs}ms, stuckTimeout=${stuckTimeoutMs}ms, providers=${SUPPORTED_PROVIDERS.join(",")})`
  );
}
