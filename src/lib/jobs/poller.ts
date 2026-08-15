import { prisma } from "@/lib/prisma";
import { getVideoProvider } from "@/lib/video-provider";
import { completeJob, failJob } from "./job-service";

let started = false;

/**
 * PROCESSING状態のジョブをポーリングしてプロバイダの状態と同期する。
 * デプロイ再起動後もDBに永続化されたPROCESSINGジョブを自動的に拾うため、
 * ジョブの取りこぼしは発生しない。
 */
export function startGenerationPoller() {
  if (started) return;
  started = true;

  const intervalMs = Number(process.env.GENERATION_POLL_INTERVAL_MS ?? 10000);
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
  }, intervalMs);

  console.log(`[poller] generation poller started (interval=${intervalMs}ms)`);
}
