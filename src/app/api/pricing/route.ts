import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";

// 非推奨。クレジット消費額はAPI使用料原価(@/lib/credits/cost)から算出するようになり、
// PricingRuleは課金にもUIにも使われていない。タブを開いたままの旧クライアントbundleが
// このエンドポイントを叩くため、互換期間として残置している。
//
// このルートを消すリリースでは、PricingRuleモデルを消さない(DROP TABLEを出さない)。
// 同時に消すと、切替中の旧インスタンスがまだこのルートを持っており、テーブルが無い状態で
// 参照して500になる。テーブルのDROPはさらに次のリリースで行う。
// 詳細は CLAUDE.md の「DB Migration Rule（expand / contract）」を参照。
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
