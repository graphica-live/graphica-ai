import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, UnauthorizedError } from "@/lib/admin/guard";
import { InsufficientCreditsError } from "@/lib/credits/ledger";
import { createGenerationBatch } from "@/lib/jobs/create-generation-batch";
import { prisma } from "@/lib/prisma";
import { RESOLUTIONS, ASPECT_RATIOS, ADAPTIVE_ASPECT_RATIO } from "@/lib/generation/options";

// BytePlus公式リファレンスは image-to-video(first/last frame)と omni reference-to-video を
// "mutually exclusive scenarios and cannot be mixed" と定義している。UIのタブと同じ粒度で
// mode を受け取り、モードごとに必須項目と併用不可項目を検証する。
// mode未指定は従来リクエスト互換のため "reference" とみなす。
const requestSchema = z
  .object({
    mode: z.enum(["reference", "image"]).default("reference"),
    prompt: z.string().max(5000).default(""),
    referenceImageKeys: z.array(z.string()).max(9).default([]),
    referenceVideoKeys: z.array(z.string()).max(10).default([]),
    firstFrameImageKey: z.string().optional(),
    endFrameImageKey: z.string().optional(),
    resolution: z.enum(RESOLUTIONS),
    durationSeconds: z.number().int().min(1).max(30),
    aspectRatio: z.enum(ASPECT_RATIOS).optional(),
    generateAudio: z.boolean().default(true),
    batchSize: z.number().int().min(1).max(10).default(1),
  })
  .superRefine((body, ctx) => {
    if (body.mode === "image") {
      if (!body.firstFrameImageKey) {
        ctx.addIssue({
          code: "custom",
          message: "先頭フレーム画像(firstFrameImageKey)は必須です",
          path: ["firstFrameImageKey"],
        });
      }
      if (body.referenceImageKeys.length > 0 || body.referenceVideoKeys.length > 0) {
        ctx.addIssue({
          code: "custom",
          message: "画像から生成するモードでは参照画像・参照動画を同時に指定できません",
          path: ["referenceImageKeys"],
        });
      }
      return;
    }

    // mode === "reference"
    if (body.prompt.length < 1) {
      ctx.addIssue({ code: "custom", message: "プロンプトは必須です", path: ["prompt"] });
    }
    if (!body.aspectRatio) {
      ctx.addIssue({ code: "custom", message: "アスペクト比は必須です", path: ["aspectRatio"] });
    }
    if (body.firstFrameImageKey || body.endFrameImageKey) {
      ctx.addIssue({
        code: "custom",
        message: "先頭・末尾フレーム画像は「画像から生成」モードでのみ指定できます",
        path: ["firstFrameImageKey"],
      });
    }
  });

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = requestSchema.parse(await req.json());

    const limits = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { allowedResolutions: true, allowedDurations: true, allowedAspectRatios: true },
    });
    // 画像から生成する場合、アスペクト比は先頭フレーム画像に追従する adaptive 固定でユーザーが
    // 選択できないため、許可リスト検証の対象外とする。
    const aspectRatioAllowed =
      body.mode === "image" || limits.allowedAspectRatios.includes(body.aspectRatio!);
    if (
      !limits.allowedResolutions.includes(body.resolution) ||
      !limits.allowedDurations.includes(body.durationSeconds) ||
      !aspectRatioAllowed
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
      firstFrameImageKey: body.firstFrameImageKey,
      endFrameImageKey: body.endFrameImageKey,
      resolution: body.resolution,
      durationSeconds: body.durationSeconds,
      aspectRatio: body.mode === "image" ? ADAPTIVE_ASPECT_RATIO : body.aspectRatio!,
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
