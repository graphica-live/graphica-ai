import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";
import { RESOLUTIONS, DURATIONS, ASPECT_RATIOS } from "@/lib/generation/options";

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  allowedResolutions: z.array(z.enum(RESOLUTIONS)).min(1).optional(),
  allowedDurations: z.array(z.number().int().refine((d) => (DURATIONS as readonly number[]).includes(d))).min(1).optional(),
  allowedAspectRatios: z.array(z.enum(ASPECT_RATIOS)).min(1).optional(),
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
    return NextResponse.json({ error: err.issues }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
}
