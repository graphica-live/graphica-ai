import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, UnauthorizedError } from "@/lib/admin/guard";
import { InsufficientCreditsError } from "@/lib/credits/ledger";
import { createGenerationBatch } from "@/lib/jobs/create-generation-batch";

const RESOLUTIONS = ["480p", "720p", "1080p"] as const;
const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3"] as const;

const requestSchema = z.object({
  prompt: z.string().min(1).max(5000),
  referenceImageKeys: z.array(z.string()).max(9).default([]),
  endFrameImageKey: z.string().optional(),
  resolution: z.enum(RESOLUTIONS),
  durationSeconds: z.number().int().min(1).max(30),
  aspectRatio: z.enum(ASPECT_RATIOS),
  batchSize: z.number().int().min(1).max(10).default(1),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = requestSchema.parse(await req.json());

    const jobIds = await createGenerationBatch({
      userId: user.id,
      actorUserId: user.impersonatedBy,
      prompt: body.prompt,
      referenceImageKeys: body.referenceImageKeys,
      endFrameImageKey: body.endFrameImageKey,
      resolution: body.resolution,
      durationSeconds: body.durationSeconds,
      aspectRatio: body.aspectRatio,
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
