import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireUser();
    const rules = await prisma.pricingRule.findMany({
      where: { isActive: true },
      orderBy: [{ resolution: "asc" }, { hasVideoInput: "asc" }],
    });
    return NextResponse.json(rules);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
