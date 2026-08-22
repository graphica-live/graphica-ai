import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthRange(month: string): { start: Date; end: Date } {
  const [year, mon] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));
  return { start, end };
}

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.parse({ month: searchParams.get("month") ?? undefined });
    const targetMonth = parsed.month ?? currentMonth();

    const monthlyRows = await prisma.$queryRaw<{ month: Date; totalJpy: bigint }[]>`
      SELECT date_trunc('month', "completedAt") AS month, SUM("creditCost")::bigint AS "totalJpy"
      FROM "GenerationJob"
      WHERE status = 'COMPLETED' AND "completedAt" IS NOT NULL
      GROUP BY month
      ORDER BY month DESC
      LIMIT 12
    `;

    const { start, end } = monthRange(targetMonth);
    const byUserRows = await prisma.generationJob.groupBy({
      by: ["userId"],
      where: { status: "COMPLETED", completedAt: { gte: start, lt: end } },
      _sum: { creditCost: true },
    });

    const users = await prisma.user.findMany({
      where: { id: { in: byUserRows.map((r) => r.userId) } },
      select: { id: true, email: true, name: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    const byUser = byUserRows
      .map((r) => {
        const user = userById.get(r.userId);
        return {
          userId: r.userId,
          email: user?.email ?? "(不明なユーザー)",
          name: user?.name ?? null,
          totalJpy: r._sum.creditCost ?? 0,
        };
      })
      .sort((a, b) => b.totalJpy - a.totalJpy);

    return NextResponse.json({
      targetMonth,
      monthly: monthlyRows.map((r) => ({
        month: r.month.toISOString().slice(0, 7),
        totalJpy: Number(r.totalJpy),
      })),
      byUser,
    });
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
