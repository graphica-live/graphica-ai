"use client";

import { cssAspectRatio } from "@/lib/generation/aspect-ratio";

interface JobStatus {
  id: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELED";
  videoUrl?: string;
  thumbnailUrl?: string;
  providerError?: string | null;
  /** 生成に使ったアスペクト比。表示枠をこの比率に合わせる(縦動画の切り取りを防ぐ)。 */
  aspectRatio?: string;
}

const STATUS_LABEL: Record<JobStatus["status"], string> = {
  PENDING: "待機中",
  PROCESSING: "生成中",
  COMPLETED: "完了",
  FAILED: "失敗",
  CANCELED: "キャンセル",
};

export function JobStatusCard({ job }: { job: JobStatus }) {
  // 生成した比率で表示する。adaptive など比率が確定しないジョブは 16:9 の枠に収め、
  // object-contain で中身を切り取らずに見せる。
  const ratio = cssAspectRatio(job.aspectRatio);

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
      <div
        className={`flex items-center justify-center bg-neutral-950 ${ratio ? "" : "aspect-video"}`}
        style={ratio ? { aspectRatio: ratio } : undefined}
      >
        {job.status === "COMPLETED" && job.videoUrl ? (
          <video src={job.videoUrl} controls className="h-full w-full object-contain" />
        ) : job.status === "FAILED" ? (
          <p className="px-4 text-center text-xs text-red-400">
            {job.providerError ?? "生成に失敗しました"}
          </p>
        ) : (
          <div className="flex flex-col items-center gap-2 text-neutral-500">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-300" />
            <p className="text-xs">{STATUS_LABEL[job.status]}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export type { JobStatus };
