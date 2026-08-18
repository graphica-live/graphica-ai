import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, UnauthorizedError } from "@/lib/admin/guard";
import { InsufficientCreditsError } from "@/lib/credits/ledger";
import { createGenerationBatch } from "@/lib/jobs/create-generation-batch";
import { prisma } from "@/lib/prisma";
import { RESOLUTIONS, ASPECT_RATIOS } from "@/lib/generation/options";

const requestSchema = z
  .object({
    prompt: z.string().min(1).max(5000),
    referenceImageKeys: z.array(z.string()).max(9).default([]),
    referenceVideoKeys: z.array(z.string()).max(10).default([]),
    endFrameImageKey: z.string().optional(),
    resolution: z.enum(RESOLUTIONS),
    durationSeconds: z.number().int().min(1).max(30),
    aspectRatio: z.enum(ASPECT_RATIOS),
    generateAudio: z.boolean().default(true),
    batchSize: z.number().int().min(1).max(10).default(1),
  })
  .refine(
    (body) => !(body.endFrameImageKey && body.referenceVideoKeys.length > 0),
    {
      message:
        "末尾フレーム画像(endFrameImageKey)と動画参照(referenceVideoKeys)は同時に指定できません",
      path: ["referenceVideoKeys"],
    }
  );

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = requestSchema.parse(await req.json());

    const limits = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { allowedResolutions: true, allowedDurations: true, allowedAspectRatios: true },
    });
    if (
      !limits.allowedResolutions.includes(body.resolution) ||
      !limits.allowedDurations.includes(body.durationSeconds) ||
      !limits.allowedAspectRatios.includes(body.aspectRatio)
    ) {
      return NextResponse.json(
        { error: "選択した設定はこのアカウントでは利用できません" },
        { status: 403 }
      );
    }

    const jobIds = await createGenerationBatch({
      userId: user.id,
      actorUserId: user.impersonatedBy,
      prompt: body.prompt,
      referenceImageKeys: body.referenceImageKeys,
      referenceVideoKeys: body.referenceVideoKeys,
      endFrameImageKey: body.endFrameImageKey,
      resolution: body.resolution,
      durationSeconds: body.durationSeconds,
      aspectRatio: body.aspectRatio,
      generateAudio: body.generateAudio,
      batchSize: body.batchSize,
    });

    return NextResponse.json({ jobIds }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
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
