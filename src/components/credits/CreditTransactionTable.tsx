"use client";

// 日時はブラウザのタイムゾーンで表示したいため、表示だけをクライアント側で行う。
// データ取得はページ(サーバーコンポーネント)側で完結しており、この表は閲覧専用。

import { creditTransactionLabel } from "@/lib/credits/adjustment";

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
  actor: { email: string; name: string | null } | null;
}

export function CreditTransactionTable({ transactions }: { transactions: Transaction[] }) {
  if (transactions.length === 0) {
    return <p className="text-sm text-neutral-500">履歴がありません。</p>;
  }

  return (
    <div className="overflow-x-auto">
      {/* 狭い画面ではセルが潰れて読めなくなるため、最小幅を確保して横スクロールさせる */}
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="border-b border-neutral-800 text-neutral-500">
          <tr>
            <th className="py-2 font-normal">日時</th>
            <th className="py-2 font-normal">種別</th>
            <th className="py-2 font-normal">金額</th>
            <th className="py-2 font-normal">残高</th>
            <th className="py-2 font-normal">操作者/メモ</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.id} className="border-b border-neutral-900">
              <td className="whitespace-nowrap py-2 text-xs text-neutral-400">
                {new Date(tx.createdAt).toLocaleString("ja-JP")}
              </td>
              <td className="whitespace-nowrap py-2">{creditTransactionLabel(tx)}</td>
              <td
                className={`whitespace-nowrap py-2 ${
                  tx.amount >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {tx.amount >= 0 ? "+" : ""}
                {tx.amount.toLocaleString()}
              </td>
              <td className="whitespace-nowrap py-2">¥{tx.balanceAfter.toLocaleString()}</td>
              <td className="py-2 text-xs text-neutral-500">{tx.actor?.email ?? tx.note ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
