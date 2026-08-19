"use client";

import { toUserFacingProviderError } from "@/lib/generation/provider-error-message";

interface JobStatus {
  id: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELED";
  videoUrl?: string;
  thumbnailUrl?: string;
  providerError?: string | null;
}

const STATUS_LABEL: Record<JobStatus["status"], string> = {
  PENDING: "待機中",
  PROCESSING: "生成中",
  COMPLETED: "完了",
  FAILED: "失敗",
  CANCELED: "キャンセル",
};

export function JobStatusCard({ job }: { job: JobStatus }) {
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
      <div className="flex aspect-video items-center justify-center bg-neutral-950">
        {job.status === "COMPLETED" && job.videoUrl ? (
          <video src={job.videoUrl} controls className="h-full w-full object-cover" />
        ) : job.status === "FAILED" ? (
          <p className="max-h-full overflow-y-auto px-4 py-3 text-center text-xs leading-relaxed text-red-400">
            {toUserFacingProviderError(job.providerError)}
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
