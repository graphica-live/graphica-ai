import { prisma } from "@/lib/prisma";
import { uploadObject } from "@/lib/storage/storage-service";
import { refundCreditsWithin } from "@/lib/credits/ledger";
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

  // 既に失敗確定(=クレジット返還済み)のジョブを完了へ巻き戻すと、
  // 返還と生成物受け取りが二重取りになるため未完了状態のジョブのみ完了にする。
  const updated = await prisma.generationJob.updateMany({
    where: { id: jobId, status: { in: ["PENDING", "PROCESSING"] } },
    data: {
      status: "COMPLETED",
      videoObjectKey,
      thumbnailObjectKey,
      completedAt: new Date(),
      actualTotalTokens: result.usage?.totalTokens,
    },
  });
  if (updated.count === 0) {
    console.warn(
      `[job-service] job ${jobId} は既に終端状態のため完了として記録しませんでした`
    );
  }
}

/**
 * ジョブを失敗として記録し、消費済みクレジットをオーナーへ返還する。
 *
 * 状態遷移と返還を同一トランザクションで行い、対象を未完了(PENDING/PROCESSING)の
 * ジョブに限定する。これにより「失敗として記録されたのに残高が戻らない」状態と、
 * ポーラーの再実行や複数インスタンスからの同時呼び出しによる二重返還の双方を防ぐ。
 */
export async function failJob(jobId: string, errorMessage: string) {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.generationJob.updateMany({
      where: { id: jobId, status: { in: ["PENDING", "PROCESSING"] } },
      data: { status: "FAILED", providerError: errorMessage, completedAt: new Date() },
    });
    // 既に他の経路で終端状態になっている場合は返還済みなので何もしない
    if (updated.count === 0) return;

    const job = await tx.generationJob.findUniqueOrThrow({ where: { id: jobId } });
    await refundCreditsWithin(
      tx,
      job.userId,
      job.creditCost,
      job.id,
      "生成失敗によるクレジット返還"
    );
  });
}
