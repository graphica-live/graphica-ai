"use client";

import { useEffect, useState } from "react";

interface MonthlyUsage {
  month: string;
  totalJpy: number;
}

interface UserUsage {
  userId: string;
  email: string;
  name: string | null;
  totalJpy: number;
}

interface UsageResponse {
  targetMonth: string;
  monthly: MonthlyUsage[];
  byUser: UserUsage[];
}

function formatMonth(month: string): string {
  const [year, mon] = month.split("-");
  return `${year}年${Number(mon)}月`;
}

export function UsageSummary() {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(month?: string) {
    setLoading(true);
    try {
      const url = month ? `/api/admin/usage?month=${month}` : "/api/admin/usage";
      const res = await fetch(url);
      const json = await res.json();
      setData(json);
      setSelectedMonth(json.targetMonth);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (data === null) {
    return <p className="text-sm text-neutral-500">読み込み中...</p>;
  }

  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-neutral-300">月ごとのAPI使用金額</h2>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-neutral-800 text-neutral-500">
          <tr>
            <th className="py-2 font-normal">月</th>
            <th className="py-2 font-normal">使用金額</th>
          </tr>
        </thead>
        <tbody>
          {data.monthly.map((m) => (
            <tr
              key={m.month}
              onClick={() => load(m.month)}
              className={`cursor-pointer border-b border-neutral-900 hover:bg-neutral-900 ${
                m.month === selectedMonth ? "bg-neutral-900" : ""
              }`}
            >
              <td className="py-3">{formatMonth(m.month)}</td>
              <td className="py-3">¥{m.totalJpy.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.monthly.length === 0 && (
        <p className="py-6 text-center text-sm text-neutral-500">
          完了した生成がまだありません。
        </p>
      )}

      <h2 className="mb-3 mt-8 text-sm font-medium text-neutral-300">
        {selectedMonth ? formatMonth(selectedMonth) : ""}のユーザーごとの使用金額
        {loading && <span className="ml-2 text-xs text-neutral-500">更新中...</span>}
      </h2>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-neutral-800 text-neutral-500">
          <tr>
            <th className="py-2 font-normal">メールアドレス</th>
            <th className="py-2 font-normal">使用金額</th>
          </tr>
        </thead>
        <tbody>
          {data.byUser.map((u) => (
            <tr key={u.userId} className="border-b border-neutral-900">
              <td className="py-3">{u.email}</td>
              <td className="py-3">¥{u.totalJpy.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.byUser.length === 0 && (
        <p className="py-6 text-center text-sm text-neutral-500">
          この月に完了した生成がありません。
        </p>
      )}
    </div>
  );
}
