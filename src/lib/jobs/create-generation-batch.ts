import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/prisma";
import { calculateCost } from "@/lib/credits/pricing";
import { InsufficientCreditsError } from "@/lib/credits/ledger";
import { getVideoProvider } from "@/lib/video-provider";
import { getPresignedDownloadUrl } from "@/lib/storage/storage-service";
import { referenceImageTag, referenceVideoTag } from "@/lib/generation/mention";
import { failJob } from "./job-service";

export interface CreateGenerationBatchInput {
  userId: string;
  actorUserId?: string;
  prompt: string;
  referenceImageKeys: string[];
  referenceVideoKeys: string[];
  firstFrameImageKey?: string;
  endFrameImageKey?: string;
  resolution: string;
  durationSeconds: number;
  aspectRatio: string;
  generateAudio: boolean;
  batchSize: number;
}

/**
 * クレジットを原子的に減算した上で生成ジョブ群を作成し、プロバイダへ送信する。
 * 残高不足の場合はDBを一切変更せず InsufficientCreditsError を投げる。
 */
export async function createGenerationBatch(input: CreateGenerationBatchInput) {
  const hasVideoInput = input.referenceVideoKeys.length > 0;
  const costPerVideo = await calculateCost({
    resolution: input.resolution,
    durationSeconds: input.durationSeconds,
    hasVideoInput,
  });
  const totalCost = costPerVideo * input.batchSize;

  const jobs = await prisma.$transaction(async (tx) => {
    const decremented = await tx.user.updateMany({
      where: { id: input.userId, creditBalance: { gte: totalCost } },
      data: { creditBalance: { decrement: totalCost } },
    });
    if (decremented.count === 0) {
      throw new InsufficientCreditsError("クレジット残高が不足しています");
    }

    const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
    let runningBalance = user.creditBalance + totalCost;

    const batchId = uuidv4();
    const createdJobs = [];
    for (let i = 0; i < input.batchSize; i++) {
      runningBalance -= costPerVideo;
      const job = await tx.generationJob.create({
        data: {
          userId: input.userId,
          actorUserId: input.actorUserId,
          batchId,
          batchIndex: i,
          batchSize: input.batchSize,
          prompt: input.prompt,
          referenceImageKeys: input.referenceImageKeys,
          referenceVideoKeys: input.referenceVideoKeys,
          firstFrameImageKey: input.firstFrameImageKey,
          endFrameImageKey: input.endFrameImageKey,
          resolution: input.resolution,
          durationSeconds: input.durationSeconds,
          aspectRatio: input.aspectRatio,
          generateAudio: input.generateAudio,
          creditCost: costPerVideo,
          status: "PENDING",
        },
      });
      await tx.creditTransaction.create({
        data: {
          type: "CONSUMPTION",
          amount: -costPerVideo,
          balanceAfter: runningBalance,
          userId: input.userId,
          generationJobId: job.id,
        },
      });
      createdJobs.push(job);
    }
    return createdJobs;
  });

  const provider = getVideoProvider();
  const referenceImageUrls = await Promise.all(
    input.referenceImageKeys.map((key) => getPresignedDownloadUrl(key))
  );
  const referenceImages = referenceImageUrls.map((url, i) => ({
    tag: referenceImageTag(i),
    url,
  }));
  const referenceVideoUrls = await Promise.all(
    input.referenceVideoKeys.map((key) => getPresignedDownloadUrl(key))
  );
  const referenceVideos = referenceVideoUrls.map((url, i) => ({
    tag: referenceVideoTag(i),
    url,
  }));
  const firstFrameImageUrl = input.firstFrameImageKey
    ? await getPresignedDownloadUrl(input.firstFrameImageKey)
    : undefined;
  const endFrameImageUrl = input.endFrameImageKey
    ? await getPresignedDownloadUrl(input.endFrameImageKey)
    : undefined;

  await Promise.all(
    jobs.map(async (job) => {
      try {
        const { providerJobId } = await provider.submit({
          prompt: input.prompt,
          referenceImages,
          referenceVideos,
          firstFrameImageUrl,
          endFrameImageUrl,
          resolution: input.resolution,
          durationSeconds: input.durationSeconds,
          aspectRatio: input.aspectRatio,
          generateAudio: input.generateAudio,
        });
        await prisma.generationJob.update({
          where: { id: job.id },
          data: { status: "PROCESSING", providerJobId, startedAt: new Date() },
        });
      } catch (err) {
        await failJob(job.id, err instanceof Error ? err.message : "生成開始に失敗しました");
      }
    })
  );

  return jobs.map((job) => job.id);
}
