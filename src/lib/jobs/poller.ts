import { prisma } from "@/lib/prisma";
import { getVideoProvider } from "@/lib/video-provider";
import { completeJob, failJob } from "./job-service";

let started = false;

const DEFAULT_STUCK_TIMEOUT_MS = 60 * 60 * 1000;

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
  const provider = getVideoProvider();

  setInterval(async () => {
    let processingJobs;
    try {
      processingJobs = await prisma.generationJob.findMany({
        where: { status: "PROCESSING" },
      });
    } catch (err) {
      console.error("[poller] failed to fetch processing jobs", err);
      return;
    }

    for (const job of processingJobs) {
      if (!job.providerJobId) continue;
      try {
        const result = await provider.getStatus(job.providerJobId);
        if (result.status === "completed") {
          await completeJob(job.id, result);
        } else if (result.status === "failed") {
          await failJob(job.id, result.errorMessage ?? "生成に失敗しました");
        }
      } catch (err) {
        console.error(`[poller] job ${job.id} status check failed`, err);
      }
    }

    try {
      await failStuckJobs(stuckTimeoutMs);
    } catch (err) {
      console.error("[poller] failed to sweep stuck jobs", err);
    }
  }, intervalMs);

  console.log(
    `[poller] generation poller started (interval=${intervalMs}ms, stuckTimeout=${stuckTimeoutMs}ms)`
  );
}
