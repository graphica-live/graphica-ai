"use client";

import { useEffect, useState } from "react";

interface Transaction {
  id: string;
  type: "GRANT" | "CONSUMPTION" | "REFUND";
  amount: number;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
  actor: { email: string; name: string | null } | null;
}

const TYPE_LABEL: Record<Transaction["type"], string> = {
  GRANT: "付与",
  CONSUMPTION: "消費",
  REFUND: "返還",
};

export function CreditHistoryTable({
  staffId,
  reloadKey,
}: {
  staffId: string;
  reloadKey: number;
}) {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);

  useEffect(() => {
    fetch(`/api/admin/staff/${staffId}/credits`)
      .then((r) => r.json())
      .then(setTransactions);
  }, [staffId, reloadKey]);

  if (transactions === null) return <p className="text-sm text-neutral-500">読み込み中...</p>;
  if (transactions.length === 0) return <p className="text-sm text-neutral-500">履歴がありません。</p>;

  return (
    <table className="w-full text-left text-sm">
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
            <td className="py-2 text-xs text-neutral-400">
              {new Date(tx.createdAt).toLocaleString("ja-JP")}
            </td>
            <td className="py-2">{TYPE_LABEL[tx.type]}</td>
            <td className={`py-2 ${tx.amount >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {tx.amount >= 0 ? "+" : ""}
              {tx.amount.toLocaleString()}
            </td>
            <td className="py-2">¥{tx.balanceAfter.toLocaleString()}</td>
            <td className="py-2 text-xs text-neutral-500">{tx.actor?.email ?? tx.note ?? "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
