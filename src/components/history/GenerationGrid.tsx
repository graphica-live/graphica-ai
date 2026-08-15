"use client";

import { useEffect, useState } from "react";
import { GenerationCard, type HistoryJob } from "./GenerationCard";

export function GenerationGrid() {
  const [jobs, setJobs] = useState<HistoryJob[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  async function loadPage(cursor?: string) {
    const url = cursor ? `/api/jobs?cursor=${cursor}` : "/api/jobs";
    const res = await fetch(url);
    const data = await res.json();
    setJobs((prev) => (prev && cursor ? [...prev, ...data.items] : data.items));
    setNextCursor(data.nextCursor);
  }

  useEffect(() => {
    loadPage();
  }, []);

  function handleDeleted(id: string) {
    setJobs((prev) => prev?.filter((j) => j.id !== id) ?? null);
  }

  if (jobs === null) {
    return <p className="text-sm text-neutral-500">読み込み中...</p>;
  }

  if (jobs.length === 0) {
    return <p className="text-sm text-neutral-500">まだ生成物がありません。</p>;
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {jobs.map((job) => (
          <GenerationCard key={job.id} job={job} onDeleted={handleDeleted} />
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
