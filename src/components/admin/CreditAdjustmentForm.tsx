"use client";

import { useState } from "react";
import { MAX_ADJUSTMENT_AMOUNT } from "@/lib/credits/adjustment";

/** 正の金額で付与、負の金額で剥奪を行うフォーム。 */
export function CreditAdjustmentForm({
  staffId,
  creditBalance,
  onAdjusted,
}: {
  staffId: string;
  creditBalance: number;
  onAdjusted: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedAmount = Number(amount);
  const isRevoke = amount.trim() !== "" && Number.isFinite(parsedAmount) && parsedAmount < 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!Number.isInteger(parsedAmount) || parsedAmount === 0) {
      setError("金額は0以外の整数で入力してください。");
      return;
    }
    if (Math.abs(parsedAmount) > MAX_ADJUSTMENT_AMOUNT) {
      setError(`1回に操作できる金額は${MAX_ADJUSTMENT_AMOUNT.toLocaleString()}円までです。`);
      return;
    }
    if (parsedAmount < 0) {
      const revoked = Math.abs(parsedAmount);
      if (revoked > creditBalance) {
        setError(`残高(¥${creditBalance.toLocaleString()})を超える剥奪はできません。`);
        return;
      }
      // 残高が減る操作なので、桁の打ち間違いを送信前に一度止める
      const confirmed = window.confirm(
        `¥${revoked.toLocaleString()} を剥奪します。\n残高は ¥${creditBalance.toLocaleString()} から ¥${(
          creditBalance - revoked
        ).toLocaleString()} になります。よろしいですか?`
      );
      if (!confirmed) return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/staff/${staffId}/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parsedAmount, note: note || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          typeof data?.error === "string"
            ? data.error
            : parsedAmount < 0
              ? "剥奪に失敗しました"
              : "付与に失敗しました"
        );
        return;
      }
      setAmount("");
      setNote("");
      onAdjusted();
    } catch {
      setError("通信に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-800 p-4"
    >
      {/* 日本語の文中で改行由来の半角スペースが入らないよう、文字列を明示的に区切る */}
      <p className="w-full text-xs leading-relaxed text-neutral-500">
        {"プラスの値で付与、マイナスの値で剥奪します(例: "}
        <span className="text-neutral-300">-1000</span>
        {" と入力すると 1,000 円を剥奪)。"}
        {"剥奪は残高の範囲内でのみ実行でき、履歴には「剥奪」として、メモには剥奪である旨が記録されます。"}
      </p>
      <div>
        <label className="mb-1 block text-xs text-neutral-500">金額(円)</label>
        <input
          type="number"
          step={1}
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-32 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
        />
      </div>
      {/* 狭い画面では金額・ボタンと同じ行に押し込めず潰れるため、最小幅を切って折り返させる */}
      <div className="min-w-[12rem] flex-1">
        <label className="mb-1 block text-xs text-neutral-500">メモ(任意)</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={isRevoke ? "剥奪の理由" : ""}
          className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className={`rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 ${
          isRevoke
            ? "bg-red-600 text-white hover:bg-red-500"
            : "bg-neutral-100 text-neutral-900 hover:bg-white"
        }`}
      >
        {isRevoke ? "剥奪" : "付与"}
      </button>
      {error && <p className="w-full text-xs text-red-400">{error}</p>}
    </form>
  );
}
