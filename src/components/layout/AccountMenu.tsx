"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import type { Role } from "@prisma/client";

export function AccountMenu({
  name,
  email,
  image,
  role,
}: {
  name?: string | null;
  email: string;
  image?: string | null;
  role: Role;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-neutral-800 text-sm font-medium ring-1 ring-neutral-700 hover:ring-neutral-500"
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={name ?? email} className="h-full w-full object-cover" />
        ) : (
          (name ?? email).charAt(0).toUpperCase()
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-lg border border-neutral-800 bg-neutral-900 py-1 shadow-xl">
          <div className="border-b border-neutral-800 px-4 py-3">
            <p className="truncate text-sm font-medium">{name ?? email}</p>
            <p className="truncate text-xs text-neutral-500">{email}</p>
          </div>
          <Link
            href="/history"
            className="block px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
            onClick={() => setOpen(false)}
          >
            生成履歴
          </Link>
          <Link
            href="/settings"
            className="block px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
            onClick={() => setOpen(false)}
          >
            設定
          </Link>
          {role === "ADMIN" && (
            <Link
              href="/admin"
              className="block px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
              onClick={() => setOpen(false)}
            >
              管理画面
            </Link>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="block w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-neutral-800"
          >
            ログアウト
          </button>
        </div>
      )}
    </div>
  );
}
