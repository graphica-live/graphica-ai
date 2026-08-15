import { prisma } from "@/lib/prisma";
import { uploadObject } from "@/lib/storage/storage-service";
import { refundCredits } from "@/lib/credits/ledger";
import type { VideoGenerationStatusResult } from "@/lib/video-provider/types";

async function fetchBytes(url: string): Promise<{ bytes: Buffer; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`生成物のダウンロードに失敗しました: ${url} (status=${res.status})`);
  }
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const arrayBuffer = await res.arrayBuffer();
  return { bytes: Buffer.from(arrayBuffer), contentType };
}

/** プロバイダが生成完了を報告したジョブの動画をbucketへ保存し、DBを更新する。 */
export async function completeJob(jobId: string, result: VideoGenerationStatusResult) {
  if (!result.videoUrl) {
    throw new Error(`completeJob: videoUrlがありません(jobId=${jobId})`);
  }

  const video = await fetchBytes(result.videoUrl);
  const videoObjectKey = `generations/${jobId}/video.mp4`;
  await uploadObject(videoObjectKey, video.bytes, video.contentType);

  let thumbnailObjectKey: string | undefined;
  if (result.thumbnailUrl) {
    const thumbnail = await fetchBytes(result.thumbnailUrl);
    thumbnailObjectKey = `generations/${jobId}/thumbnail.jpg`;
    await uploadObject(thumbnailObjectKey, thumbnail.bytes, thumbnail.contentType);
  }

  await prisma.generationJob.update({
    where: { id: jobId },
    data: {
      status: "COMPLETED",
      videoObjectKey,
      thumbnailObjectKey,
      completedAt: new Date(),
    },
  });
}

/** ジョブを失敗として記録し、消費済みクレジットを返還する。 */
export async function failJob(jobId: string, errorMessage: string) {
  const job = await prisma.generationJob.update({
    where: { id: jobId },
    data: { status: "FAILED", providerError: errorMessage, completedAt: new Date() },
  });
  await refundCredits(job.userId, job.creditCost, job.id, "生成失敗によるクレジット返還");
}
