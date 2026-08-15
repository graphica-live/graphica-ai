"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginError() {
  const params = useSearchParams();
  const error = params.get("error");
  if (!error) return null;

  const message =
    error === "AccessDenied"
      ? "このメールアドレスは登録されていません。管理者にスタッフ登録を依頼してください。"
      : "ログインに失敗しました。もう一度お試しください。";

  return (
    <p className="mt-4 rounded-md bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-300">
      {message}
    </p>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Graphica AI Video</h1>
        <p className="mt-2 text-sm text-neutral-400">社内向けAI動画生成サービス</p>
      </div>

      <button
        onClick={() => signIn("google", { callbackUrl: "/" })}
        className="flex items-center gap-3 rounded-full bg-neutral-100 px-6 py-3 text-sm font-medium text-neutral-900 transition-colors hover:bg-white"
      >
        Googleでログイン
      </button>

      <Suspense fallback={null}>
        <LoginError />
      </Suspense>
    </div>
  );
}
