"use client";

import { useState } from "react";
import { impersonateSignOut } from "@/lib/auth/impersonate-client";

export function ImpersonationBanner({ name }: { name: string }) {
  const [loading, setLoading] = useState(false);

  async function handleEnd() {
    setLoading(true);
    const { url } = await impersonateSignOut("/login");
    window.location.href = url;
  }

  return (
    <div className="flex items-center justify-center gap-3 bg-amber-500 px-6 py-1.5 text-center text-xs font-medium text-amber-950">
      <span>管理者代理操作中（{name}として操作しています）</span>
      <button
        onClick={handleEnd}
        disabled={loading}
        className="rounded border border-amber-950/30 px-2 py-0.5 hover:bg-amber-600 disabled:opacity-50"
      >
        {loading ? "終了中..." : "代理ログインを終了"}
      </button>
    </div>
  );
}
