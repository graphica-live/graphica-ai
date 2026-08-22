import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";

// 非推奨。クレジット消費額はAPI使用料原価(@/lib/credits/cost)から算出するようになり、
// PricingRuleは課金にもUIにも使われていない。デプロイのローリング中に残っている
// 旧クライアントbundleがこのエンドポイントを叩くため、互換期間として残置している。
// PricingRuleモデルとテーブルごと次のリリースで削除すること。
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
