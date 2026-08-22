import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";
import {
  RESOLUTIONS,
  ASPECT_RATIOS,
  GENERATION_MODES,
  DURATION_MIN_SECONDS,
  DURATION_MAX_SECONDS,
} from "@/lib/generation/options";

// 未知キーを黙って無視すると、旧クライアントが廃止済みの allowedDurations を送っても
// 200になり「保存できたのに反映されない」状態になるため strict にする。
const patchSchema = z
  .strictObject({
    isActive: z.boolean().optional(),
    allowedResolutions: z.array(z.enum(RESOLUTIONS)).min(1).optional(),
    minDurationSeconds: z
      .number()
      .int()
      .min(DURATION_MIN_SECONDS)
      .max(DURATION_MAX_SECONDS)
      .optional(),
    maxDurationSeconds: z
      .number()
      .int()
      .min(DURATION_MIN_SECONDS)
      .max(DURATION_MAX_SECONDS)
      .optional(),
    allowedAspectRatios: z.array(z.enum(ASPECT_RATIOS)).min(1).optional(),
    allowedGenerationModes: z.array(z.enum(GENERATION_MODES)).min(1).optional(),
  })
  .superRefine((body, ctx) => {
    const hasMin = body.minDurationSeconds !== undefined;
    const hasMax = body.maxDurationSeconds !== undefined;
    // 片方だけの更新を許すとDBの既存値と突き合わせないと min <= max を保証できないため、
    // 動画長の範囲は常に両方セットで受け取る。
    if (hasMin !== hasMax) {
      ctx.addIssue({
        code: "custom",
        message: "動画長の下限と上限は同時に指定してください",
        path: ["minDurationSeconds"],
      });
      return;
    }
    if (hasMin && hasMax && body.minDurationSeconds! > body.maxDurationSeconds!) {
      ctx.addIssue({
        code: "custom",
        message: "動画長の下限は上限以下にしてください",
        path: ["minDurationSeconds"],
      });
    }
  });

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const staff = await prisma.user.findUnique({ where: { id: params.id } });
    if (!staff) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
    return NextResponse.json(staff);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const body = patchSchema.parse(await req.json());
    const staff = await prisma.user.update({
      where: { id: params.id },
      data: body,
    });
    return NextResponse.json(staff);
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof z.ZodError) {
    // 呼び出し元(管理画面のフォーム)はerrorを文字列として表示するため、issues配列のまま返さない
    return NextResponse.json(
      { error: err.issues.map((i) => i.message).join(" / ") },
      { status: 400 }
    );
  }
  console.error(err);
  return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
}
