"use client";

import { useEffect, useState } from "react";
import { GenerationCard, type HistoryJob } from "./GenerationCard";

export function GenerationGrid({ pinnedOnly = false }: { pinnedOnly?: boolean }) {
  const [jobs, setJobs] = useState<HistoryJob[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  async function loadPage(cursor?: string) {
    const params = new URLSearchParams();
    if (pinnedOnly) params.set("pinned", "1");
    if (cursor) params.set("cursor", cursor);
    const query = params.toString();
    const res = await fetch(query ? `/api/jobs?${query}` : "/api/jobs");
    const data = await res.json();
    setJobs((prev) => (prev && cursor ? [...prev, ...data.items] : data.items));
    setNextCursor(data.nextCursor);
  }

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedOnly]);

  function handleDeleted(id: string) {
    setJobs((prev) => prev?.filter((j) => j.id !== id) ?? null);
  }

  function handlePinChanged(id: string, isPinned: boolean) {
    setJobs((prev) => {
      if (!prev) return prev;
      // ピン止め一覧では解除された時点で対象外になるため取り除く
      if (pinnedOnly && !isPinned) return prev.filter((j) => j.id !== id);
      return prev.map((j) => (j.id === id ? { ...j, isPinned } : j));
    });
  }

  if (jobs === null) {
    return <p className="text-sm text-neutral-500">読み込み中...</p>;
  }

  // 表示中の全件を削除・ピン解除した場合でも、続きが残っていれば
  // 「もっと見る」を出す(空状態で早期returnしない)
  if (jobs.length === 0 && !nextCursor) {
    return (
      <p className="text-sm text-neutral-500">
        {pinnedOnly ? "ピン止めした生成物はまだありません。" : "まだ生成物がありません。"}
      </p>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {jobs.map((job) => (
          <GenerationCard
            key={job.id}
            job={job}
            onDeleted={handleDeleted}
            onPinChanged={handlePinChanged}
          />
        ))}
      </div>
      {nextCursor && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={async () => {
              setLoadingMore(true);
              await loadPage(nextCursor);
              setLoadingMore(false);
            }}
            disabled={loadingMore}
            className="rounded-md border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800 disabled:opacity-50"
          >
            {loadingMore ? "読み込み中..." : "もっと見る"}
          </button>
        </div>
      )}
    </div>
  );
}
