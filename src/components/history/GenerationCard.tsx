"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface HistoryJob {
  id: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELED";
  prompt: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  createdAt: string;
}

const STATUS_LABEL: Record<HistoryJob["status"], string> = {
  PENDING: "待機中",
  PROCESSING: "生成中",
  COMPLETED: "完了",
  FAILED: "失敗",
  CANCELED: "キャンセル",
};

export function GenerationCard({
  job,
  onDeleted,
}: {
  job: HistoryJob;
  onDeleted: (id: string) => void;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [deleting, setDeleting] = useState(false);

  function handleMouseEnter() {
    videoRef.current?.play().catch(() => {});
  }

  function handleMouseLeave() {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
  }

  async function handleDelete() {
    if (!confirm("この生成物を削除しますか？実データも完全に削除されます。")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
      if (res.ok) onDeleted(job.id);
    } finally {
      setDeleting(false);
    }
  }

  function handleReuse() {
    router.push(`/?fromJobId=${job.id}`);
  }

  return (
    <div className="group overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
      <div
        className="relative aspect-video bg-neutral-950"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {job.status === "COMPLETED" && job.videoUrl ? (
          <video
            ref={videoRef}
            src={job.videoUrl}
            poster={job.thumbnailUrl}
            muted
            loop
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-neutral-500">
            {STATUS_LABEL[job.status]}
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-xs text-neutral-400">{job.prompt}</p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleReuse}
            className="flex-1 rounded-md border border-neutral-700 py-1.5 text-xs hover:bg-neutral-800"
          >
            引用
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 rounded-md border border-red-900 py-1.5 text-xs text-red-400 hover:bg-red-950 disabled:opacity-50"
          >
            削除
          </button>
        </div>
      </div>
    </div>
  );
}
