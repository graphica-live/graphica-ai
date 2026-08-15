"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ImpersonateButton } from "./ImpersonateButton";

interface Staff {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  creditBalance: number;
}

export function StaffTable() {
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/staff");
    setStaff(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAdding(true);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "追加に失敗しました");
        return;
      }
      setNewEmail("");
      await load();
    } finally {
      setAdding(false);
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    await fetch(`/api/admin/staff/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    await load();
  }

  if (staff === null) return <p className="text-sm text-neutral-500">読み込み中...</p>;

  return (
    <div>
      <form onSubmit={handleAdd} className="mb-6 flex gap-2">
        <input
          type="email"
          required
          placeholder="staff@example.com"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          className="w-72 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={adding}
          className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-50"
        >
          スタッフ追加
        </button>
      </form>
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      <table className="w-full text-left text-sm">
        <thead className="border-b border-neutral-800 text-neutral-500">
          <tr>
            <th className="py-2 font-normal">メールアドレス</th>
            <th className="py-2 font-normal">残高</th>
            <th className="py-2 font-normal">状態</th>
            <th className="py-2 font-normal">操作</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.id} className="border-b border-neutral-900">
              <td className="py-3">
                <Link href={`/admin/staff/${s.id}`} className="hover:underline">
                  {s.email}
                </Link>
              </td>
              <td className="py-3">¥{s.creditBalance.toLocaleString()}</td>
              <td className="py-3">
                <button
                  onClick={() => toggleActive(s.id, s.isActive)}
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    s.isActive
                      ? "bg-emerald-950 text-emerald-400"
                      : "bg-neutral-800 text-neutral-500"
                  }`}
                >
                  {s.isActive ? "有効" : "無効"}
                </button>
              </td>
              <td className="py-3">
                <div className="flex gap-2">
                  <Link
                    href={`/admin/staff/${s.id}`}
                    className="rounded-md border border-neutral-700 px-3 py-1 text-xs hover:bg-neutral-800"
                  >
                    詳細
                  </Link>
                  <ImpersonateButton staffId={s.id} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {staff.length === 0 && (
        <p className="py-6 text-center text-sm text-neutral-500">
          スタッフが登録されていません。
        </p>
      )}
    </div>
  );
}
