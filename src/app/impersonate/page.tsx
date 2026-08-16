"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { impersonateSignIn } from "@/lib/auth/impersonate-client";

function ImpersonateInner() {
  const params = useSearchParams();
  const token = params.get("token");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("トークンが指定されていません");
      return;
    }
    impersonateSignIn(token, "/").then(({ url }) => {
      window.location.href = url;
    });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-sm">
      {error ? (
        <p className="text-red-400">{error}</p>
      ) : (
        <p className="text-neutral-400">スタッフとしてログイン中...</p>
      )}
    </div>
  );
}

export default function ImpersonatePage() {
  return (
    <Suspense fallback={null}>
      <ImpersonateInner />
    </Suspense>
  );
}
