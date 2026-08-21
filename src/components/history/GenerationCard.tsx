"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { downloadFile } from "@/lib/download";
import { videoDownloadFilename } from "@/lib/jobs/video-naming";

export interface HistoryJob {
  id: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELED";
  prompt: string;
  videoUrl?: string;
  downloadUrl?: string;
  thumbnailUrl?: string;
  createdAt: string;
  /** ピン止め日時。null / undefined は未ピン。 */
  pinnedAt?: string | null;
}

const STATUS_LABEL: Record<HistoryJob["status"], string> = {
  PENDING: "待機中",
  PROCESSING: "生成中",
  COMPLETED: "完了",
  FAILED: "失敗",
  CANCELED: "キャンセル",
};

function DownloadButton({ job, className }: { job: HistoryJob; className: string }) {
  const [saving, setSaving] = useState(false);
  const downloadUrl = job.downloadUrl;
  if (!downloadUrl) return null;

  async function handleClick() {
    setSaving(true);
    try {
      await downloadFile(downloadUrl!, videoDownloadFilename(job.id));
    } finally {
      setSaving(false);
    }
  }

  return (
    <button onClick={handleClick} disabled={saving} className={className}>
      {saving ? "保存中…" : "ダウンロード"}
    </button>
  );
}

/** サムネイル右上に重ねるお気に入り(ピン止め)トグル。文字は出さず☆のみ。 */
function PinButton({
  pinned,
  onToggle,
}: {
  pinned: boolean;
  onToggle: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    // 親のサムネイルクリック(ライトボックス展開)へ伝播させない
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await onToggle();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-pressed={pinned}
      aria-label={pinned ? "ピン止めを解除" : "ピン止めする"}
      title={pinned ? "ピン止めを解除" : "ピン止めする"}
      className={`absolute right-2 top-2 z-10 rounded-full bg-black/50 p-1.5 backdrop-blur-sm transition hover:bg-black/70 disabled:opacity-50 ${
        pinned ? "text-amber-400" : "text-white/80 hover:text-white"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill={pinned ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3.2l2.7 5.47 6.04.88-4.37 4.26 1.03 6.01L12 17l-5.4 2.82 1.03-6.01L3.26 9.55l6.04-.88L12 3.2z" />
      </svg>
    </button>
  );
}

function VideoLightbox({ job, onClose }: { job: HistoryJob; onClose: () => void }) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-3xl flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <video
          src={job.videoUrl}
          poster={job.thumbnailUrl}
          controls
          autoPlay
          playsInline
          className="max-h-[80vh] w-full rounded-lg bg-black"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="line-clamp-1 text-xs text-neutral-400">{job.prompt}</p>
          <div className="flex shrink-0 gap-2">
            <DownloadButton
              job={job}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-800 disabled:opacity-50"
            />
            <button
              onClick={onClose}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-800"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GenerationCard({
  job,
  onDeleted,
  onPinChanged,
}: {
  job: HistoryJob;
  onDeleted: (id: string) => void;
  onPinChanged?: (id: string, pinnedAt: string | null) => void;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

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

  const pinned = Boolean(job.pinnedAt);

  async function handleTogglePin() {
    const next = !pinned;
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: next }),
      });
      if (!res.ok) return;
      const data = await res.json();
      onPinChanged?.(job.id, data.pinnedAt ?? null);
    } catch (err) {
      console.error(err);
    }
  }

  const canExpand = job.status === "COMPLETED" && Boolean(job.videoUrl);

  return (
    <div className="group overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
      <div
        className={`relative aspect-video bg-neutral-950 ${canExpand ? "cursor-pointer" : ""}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={() => canExpand && setLightboxOpen(true)}
      >
        {canExpand ? (
          <>
            <video
              ref={videoRef}
              src={job.videoUrl}
              poster={job.thumbnailUrl}
              muted
              loop
              playsInline
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
              <span className="rounded-full bg-black/60 p-2 text-white">
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                  <path
                    d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-neutral-500">
            {STATUS_LABEL[job.status]}
          </div>
        )}
        <PinButton pinned={pinned} onToggle={handleTogglePin} />
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
          <DownloadButton
            job={job}
            className="flex-1 rounded-md border border-neutral-700 py-1.5 text-center text-xs hover:bg-neutral-800 disabled:opacity-50"
          />
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 rounded-md border border-red-900 py-1.5 text-xs text-red-400 hover:bg-red-950 disabled:opacity-50"
          >
            削除
          </button>
        </div>
      </div>
      {lightboxOpen && <VideoLightbox job={job} onClose={() => setLightboxOpen(false)} />}
    </div>
  );
}
