import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, UnauthorizedError } from "@/lib/admin/guard";
import { InsufficientCreditsError } from "@/lib/credits/ledger";
import { createGenerationBatch } from "@/lib/jobs/create-generation-batch";
import { prisma } from "@/lib/prisma";
import { ADAPTIVE_ASPECT_RATIO, GENERATION_MODE_LABELS } from "@/lib/generation/options";
import { getModelSpec } from "@/lib/generation/models";
import { isMiniMaxAvailable } from "@/lib/video-provider";
import { assertOwnedUploadKeys, ForeignUploadKeyError } from "@/lib/storage/upload-key";
import { generateRequestSchema } from "./generate-schema";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = generateRequestSchema.parse(await req.json());
    const spec = getModelSpec(body.model);

    if (body.model === "minimax-h3" && !isMiniMaxAvailable()) {
      return NextResponse.json(
        { error: "MiniMax H3 は現在利用できません。管理者に連絡してください。" },
        { status: 503 }
      );
    }

    const limits = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        allowedResolutions: true,
        minDurationSeconds: true,
        maxDurationSeconds: true,
        allowedAspectRatios: true,
        allowedGenerationModes: true,
        allowedModels: true,
      },
    });

    if (!limits.allowedModels.includes(body.model)) {
      return NextResponse.json(
        { error: `「${spec.label}」はこのアカウントでは利用できません` },
        { status: 403 }
      );
    }

    // 素材キーはクライアントから渡ってくる。他人のアップロードを指定できないよう、
    // 参照素材とフレーム画像のすべてについて持ち主を検証する。
    assertOwnedUploadKeys(user.id, [
      ...body.referenceImageKeys,
      ...body.referenceVideoKeys,
      ...(body.model === "minimax-h3" ? body.referenceAudioKeys : []),
      body.firstFrameImageKey,
      body.endFrameImageKey,
    ]);

    // 動画長はスタッフごとに下限・上限の範囲で制限する(UIのスライダーと同じ境界)。
    // モデル非依存の指標なので H3 にもそのまま適用する。
    const durationAllowed =
      body.durationSeconds >= limits.minDurationSeconds &&
      body.durationSeconds <= limits.maxDurationSeconds;

    // 先頭フレーム画像を使うモードではアスペクト比が画像に追従する adaptive 固定で
    // ユーザーが選択できないため、許可リスト検証の対象外とする。
    const usesAdaptiveRatio = body.mode === "image" || body.mode === "firstlast";
    const aspectRatioAllowed =
      usesAdaptiveRatio || limits.allowedAspectRatios.includes(body.aspectRatio!);

    if (body.model === "seedance-2.5") {
      // 生成モードと解像度の許可リストは Seedance 専用の制限として運用する
      // （H3 の可否は allowedModels で制御する。理由は prisma/schema.prisma のコメント参照）。
      if (!limits.allowedGenerationModes.includes(body.mode)) {
        return NextResponse.json(
          { error: `「${GENERATION_MODE_LABELS[body.mode]}」はこのアカウントでは利用できません` },
          { status: 403 }
        );
      }
      if (!limits.allowedResolutions.includes(body.resolution)) {
        return NextResponse.json(
          { error: "選択した設定はこのアカウントでは利用できません" },
          { status: 403 }
        );
      }
    }

    if (!durationAllowed || !aspectRatioAllowed) {
      return NextResponse.json(
        { error: "選択した設定はこのアカウントでは利用できません" },
        { status: 403 }
      );
    }

    const jobIds = await createGenerationBatch({
      userId: user.id,
      actorUserId: user.impersonatedBy,
      model: body.model,
      mode: body.mode,
      prompt: body.prompt,
      referenceImageKeys: body.referenceImageKeys,
      referenceVideoKeys: body.referenceVideoKeys,
      referenceAudioKeys: body.model === "minimax-h3" ? body.referenceAudioKeys : [],
      firstFrameImageKey: body.firstFrameImageKey,
      endFrameImageKey: body.endFrameImageKey,
      resolution: body.resolution,
      durationSeconds: body.durationSeconds,
      aspectRatio: usesAdaptiveRatio ? ADAPTIVE_ASPECT_RATIO : body.aspectRatio!,
      // H3 は常にネイティブ音声を生成するため、ユーザーの選択肢を持たない
      generateAudio: body.model === "seedance-2.5" ? body.generateAudio : true,
      batchSize: body.batchSize,
    });

    return NextResponse.json({ jobIds }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ForeignUploadKeyError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(
        {
          error:
            "クレジット残高が不足しています。管理者に追加のクレジット付与を依頼してください。",
        },
        { status: 402 }
      );
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
