import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/prisma";
import { estimateGenerationCostJpy } from "@/lib/credits/cost";
import { InsufficientCreditsError } from "@/lib/credits/ledger";
import { getVideoProvider } from "@/lib/video-provider";
import { RetryableProviderError, TerminalProviderError } from "@/lib/video-provider/types";
import { logProviderError } from "@/lib/video-provider/provider-log";
import { getPresignedDownloadUrl } from "@/lib/storage/storage-service";
import { referenceImageTag, referenceVideoTag } from "@/lib/generation/mention";
import { getModelSpec, providerOf, type VideoModelId } from "@/lib/generation/models";
import type { GenerationMode } from "@/lib/generation/options";
import { failJob } from "./job-service";

export interface CreateGenerationBatchInput {
  userId: string;
  actorUserId?: string;
  model: VideoModelId;
  mode: GenerationMode;
  prompt: string;
  referenceImageKeys: string[];
  referenceVideoKeys: string[];
  referenceAudioKeys: string[];
  firstFrameImageKey?: string;
  endFrameImageKey?: string;
  resolution: string;
  durationSeconds: number;
  aspectRatio: string;
  generateAudio: boolean;
  batchSize: number;
}

function referenceAudioTag(index: number): string {
  return `@audio${index + 1}`;
}

/**
 * クレジットを原子的に減算した上で生成ジョブ群を作成し、プロバイダへ送信する。
 * 残高不足の場合はDBを一切変更せず InsufficientCreditsError を投げる。
 *
 * ここで引くのはAPI使用料原価の概算(仮押さえ)。プロバイダが実使用量を報告した
 * 時点で completeJob が差額を精算し、最終的な消費額を実原価に一致させる。
 */
export async function createGenerationBatch(input: CreateGenerationBatchInput) {
  const spec = getModelSpec(input.model);
  const providerName = providerOf(input.model);
  const hasVideoInput = input.referenceVideoKeys.length > 0;
  const costPerVideo = estimateGenerationCostJpy({
    model: input.model,
    resolution: input.resolution,
    durationSeconds: input.durationSeconds,
    hasVideoInput,
    referenceImageCount: input.referenceImageKeys.length,
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
          provider: providerName,
          model: input.model,
          generationMode: input.mode,
          prompt: input.prompt,
          referenceImageKeys: input.referenceImageKeys,
          referenceVideoKeys: input.referenceVideoKeys,
          referenceAudioKeys: input.referenceAudioKeys,
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

  const provider = getVideoProvider(providerName);
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
  const referenceAudioUrls = await Promise.all(
    input.referenceAudioKeys.map((key) => getPresignedDownloadUrl(key))
  );
  const referenceAudios = referenceAudioUrls.map((url, i) => ({
    tag: referenceAudioTag(i),
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
          model: input.model,
          mode: input.mode,
          prompt: input.prompt,
          referenceImages,
          referenceVideos,
          referenceAudios,
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
        await handleSubmitFailure(job.id, spec.label, err);
      }
    })
  );

  return jobs.map((job) => job.id);
}

/**
 * submit の失敗をジョブへ反映する。
 *
 * 4xx の確定的な拒否と、ネットワーク障害・タイムアウト・5xx の「受理されたか不明」を
 * 区別してログに残す。後者はプロバイダ側で生成と課金が始まっている可能性があるが、
 * task_id が手元に無いため追跡できない（自動リコンサイルは未実装）。
 * スタッフ視点では成果物が無いので、いずれの場合もクレジットは返還する。
 */
async function handleSubmitFailure(jobId: string, modelLabel: string, err: unknown) {
  if (err instanceof TerminalProviderError) {
    await failJob(jobId, err.userMessage, err.detail.errorCode);
    return;
  }
  if (err instanceof RetryableProviderError) {
    logProviderError("submission-unknown", { ...err.detail, taskId: jobId });
    await failJob(
      jobId,
      "現在混み合っています。しばらく待ってから再試行してください。",
      err.detail.errorCode
    );
    return;
  }
  console.error(`[create-generation-batch] submit failed (job=${jobId}, model=${modelLabel})`, err);
  await failJob(jobId, "生成の開始に失敗しました。時間をおいて再試行してください。");
}
