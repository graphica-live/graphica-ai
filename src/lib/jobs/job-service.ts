import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { uploadObject } from "@/lib/storage/storage-service";
import { videoObjectKey as buildVideoObjectKey } from "@/lib/jobs/video-naming";
import { refundCreditsWithin } from "@/lib/credits/ledger";
import { actualCostJpy } from "@/lib/credits/cost";
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

/**
 * 仮押さえ額(creditCost)と実トークンから算出した確定原価の差額を精算する。
 *
 * 呼び出し元のトランザクション内で、ジョブを終端状態へ進める条件付き更新が
 * 成功した直後にだけ実行すること。その更新が精算の一回性ガードになっている。
 *
 * completeJob は生成物のアップロードを伴うため、精算単体を検証できるようexportしている。
 */
export async function settleCostWithin(
  tx: Prisma.TransactionClient,
  jobId: string,
  totalTokens?: number
) {
  const job = await tx.generationJob.findUniqueOrThrow({ where: { id: jobId } });
  const settled = actualCostJpy(totalTokens, job.referenceVideoKeys.length > 0);
  // 実トークンが未報告、または値が信用できない場合は仮押さえ額のまま確定させる
  if (settled === null) return;

  const diff = settled - job.creditCost;
  if (diff === 0) return;

  if (diff > 0) {
    // 実原価が概算を上回った分を追加で消費する。API原価は既に発生しているため、
    // 残高が足りなくてもマイナス残高として記録し、次回生成時の残高チェックで弾く。
    const user = await tx.user.update({
      where: { id: job.userId },
      data: { creditBalance: { decrement: diff } },
    });
    await tx.creditTransaction.create({
      data: {
        type: "CONSUMPTION",
        amount: -diff,
        balanceAfter: user.creditBalance,
        userId: job.userId,
        generationJobId: job.id,
        note: "実トークン確定による追加消費",
      },
    });
  } else {
    await refundCreditsWithin(
      tx,
      job.userId,
      -diff,
      job.id,
      "実トークン確定による差額返還"
    );
  }

  await tx.generationJob.update({
    where: { id: job.id },
    data: { creditCost: settled },
  });
}

/** プロバイダが生成完了を報告したジョブの動画をbucketへ保存し、DBを更新する。 */
export async function completeJob(jobId: string, result: VideoGenerationStatusResult) {
  if (!result.videoUrl) {
    throw new Error(`completeJob: videoUrlがありません(jobId=${jobId})`);
  }

  // 外部I/O(ダウンロード・アップロード)はトランザクションの外で終わらせる。
  const video = await fetchBytes(result.videoUrl);
  const videoObjectKey = buildVideoObjectKey(jobId);
  await uploadObject(videoObjectKey, video.bytes, video.contentType);

  let thumbnailObjectKey: string | undefined;
  if (result.thumbnailUrl) {
    const thumbnail = await fetchBytes(result.thumbnailUrl);
    thumbnailObjectKey = `generations/${jobId}/thumbnail.jpg`;
    await uploadObject(thumbnailObjectKey, thumbnail.bytes, thumbnail.contentType);
  }

  await prisma.$transaction(async (tx) => {
    // 既に失敗確定(=クレジット返還済み)のジョブを完了へ巻き戻すと、
    // 返還と生成物受け取りが二重取りになるため未完了状態のジョブのみ完了にする。
    // この条件付き更新を先頭に置くことで、ポーラーの再実行や複数インスタンスから
    // 同時に呼ばれても残高に触れるのは一度だけになる。
    const updated = await tx.generationJob.updateMany({
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
      return;
    }

    await settleCostWithin(tx, jobId, result.usage?.totalTokens);
  });
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
