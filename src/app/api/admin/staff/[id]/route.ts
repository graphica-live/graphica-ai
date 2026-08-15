import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  isActive: z.boolean(),
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
      data: { isActive: body.isActive },
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
