import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";
import {
  grantCredits,
  revokeCredits,
  InsufficientCreditsError,
  UserNotFoundError,
} from "@/lib/credits/ledger";
import { creditAdjustmentSchema, revokeNote } from "@/lib/credits/adjustment";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const transactions = await prisma.creditTransaction.findMany({
      where: { userId: params.id },
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { email: true, name: true } } },
      take: 100,
    });
    return NextResponse.json(transactions);
  } catch (err) {
    return handleError(err);
  }
}

/** 正の金額なら付与、負の金額なら剥奪として処理する。 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    const body = creditAdjustmentSchema.parse(await req.json());
    const transaction =
      body.amount > 0
        ? await grantCredits(params.id, admin.id, body.amount, body.note)
        : await revokeCredits(params.id, admin.id, -body.amount, revokeNote(body.note));
    return NextResponse.json(transaction, { status: 201 });
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
  if (err instanceof UserNotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof InsufficientCreditsError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof z.ZodError) {
    // フォームはこの error をそのまま文字列として描画するため、ここで1本にまとめる
    return NextResponse.json(
      { error: err.issues.map((issue) => issue.message).join(" / ") },
      { status: 400 }
    );
  }
  console.error(err);
  return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
}
