import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";
import { grantCredits } from "@/lib/credits/ledger";

const grantSchema = z.object({
  amount: z.number().int().positive().max(10_000_000),
  note: z.string().max(500).optional(),
});

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

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    const body = grantSchema.parse(await req.json());
    const transaction = await grantCredits(params.id, admin.id, body.amount, body.note);
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
  if (err instanceof z.ZodError) {
    return NextResponse.json({ error: err.issues }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
}
