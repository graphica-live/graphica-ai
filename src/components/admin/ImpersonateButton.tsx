"use client";

import { useState } from "react";

export function ImpersonateButton({ staffId }: { staffId: string }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/staff/${staffId}/impersonate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "代理ログイントークンの発行に失敗しました");
        return;
      }
      window.open(`/impersonate?token=${data.token}`, "_blank");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="rounded-md border border-neutral-700 px-3 py-1 text-xs hover:bg-neutral-800 disabled:opacity-50"
    >
      {loading ? "発行中..." : "別窓でログイン"}
    </button>
  );
}
