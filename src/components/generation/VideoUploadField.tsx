"use client";

import { useRef, useState } from "react";
import { referenceVideoTag } from "@/lib/generation/mention";

interface UploadedVideo {
  key: string;
  previewUrl: string;
  durationSeconds: number;
}

const ALLOWED_TYPES = ["video/mp4"];
// アプリ独自の上限(公式の1リクエストあたり最大10本より保守的)
const MAX_VIDEOS = 3;
// 公式「Video input requirements」: 動画1本あたり200MB以下
const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;
// 公式: non-video-editingタスク(reference用途)は各動画2〜30秒、合計30秒以内
const MIN_DURATION_SECONDS = 2;
const MAX_DURATION_SECONDS = 30;
const MAX_TOTAL_DURATION_SECONDS = 30;

function readVideoMetadata(file: File): Promise<{ durationSeconds: number; thumbnailUrl: string }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    function cleanup() {
      URL.revokeObjectURL(objectUrl);
    }

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.1, video.duration);
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 180;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas contextの取得に失敗しました");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const thumbnailUrl = canvas.toDataURL("image/jpeg", 0.7);
        const durationSeconds = video.duration;
        cleanup();
        resolve({ durationSeconds, thumbnailUrl });
      } catch (err) {
        cleanup();
        reject(err);
      }
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("動画の読み込みに失敗しました"));
    };
  });
}

export function VideoUploadField({
  videos,
  onChange,
  label = "参照動画",
}: {
  videos: UploadedVideo[];
  onChange: (videos: UploadedVideo[]) => void;
  label?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File, totalSecondsSoFar: number): Promise<UploadedVideo | null> {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(`未対応のファイル形式です: ${file.name}(mp4のみ対応)`);
      return null;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`ファイルサイズが上限(200MB)を超えています: ${file.name}`);
      return null;
    }

    let metadata: { durationSeconds: number; thumbnailUrl: string };
    try {
      metadata = await readVideoMetadata(file);
    } catch {
      setError(`動画の読み込みに失敗しました: ${file.name}`);
      return null;
    }

    if (metadata.durationSeconds < MIN_DURATION_SECONDS || metadata.durationSeconds > MAX_DURATION_SECONDS) {
      setError(
        `動画は${MIN_DURATION_SECONDS}〜${MAX_DURATION_SECONDS}秒の範囲にしてください: ${file.name}(${metadata.durationSeconds.toFixed(1)}秒)`
      );
      return null;
    }
    if (totalSecondsSoFar + metadata.durationSeconds > MAX_TOTAL_DURATION_SECONDS) {
      setError(`参照動画の合計時間が${MAX_TOTAL_DURATION_SECONDS}秒を超えています: ${file.name}`);
      return null;
    }

    const presignRes = await fetch("/api/uploads/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentType: file.type }),
    });
    if (!presignRes.ok) {
      setError("アップロードURLの発行に失敗しました");
      return null;
    }
    const { key, uploadUrl } = await presignRes.json();

    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!putRes.ok) {
      setError(`アップロードに失敗しました: ${file.name}`);
      return null;
    }

    return { key, previewUrl: metadata.thumbnailUrl, durationSeconds: metadata.durationSeconds };
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const remaining = MAX_VIDEOS - videos.length;
      const filesToUpload = Array.from(files).slice(0, remaining);

      let totalSecondsSoFar = videos.reduce((sum, v) => sum + v.durationSeconds, 0);
      const uploaded: UploadedVideo[] = [];
      for (const file of filesToUpload) {
        const result = await uploadFile(file, totalSecondsSoFar);
        if (result) {
          uploaded.push(result);
          totalSecondsSoFar += result.durationSeconds;
        }
      }

      onChange([...videos, ...uploaded]);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeVideo(key: string) {
    onChange(videos.filter((v) => v.key !== key));
  }

  const totalSeconds = videos.reduce((sum, v) => sum + v.durationSeconds, 0);

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-neutral-300">
        {label}{" "}
        <span className="text-neutral-500">
          ({videos.length}/{MAX_VIDEOS}, 合計{totalSeconds.toFixed(1)}/{MAX_TOTAL_DURATION_SECONDS}秒)
        </span>
      </p>
      {videos.length > 0 && (
        <p className="mb-2 text-xs text-neutral-500">
          プロンプト内で @video1 のように入力すると、対応する動画を参照として指定できます
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {videos.map((v, i) => (
          <div key={v.key} className="group relative h-20 w-20 overflow-hidden rounded-md border border-neutral-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={v.previewUrl} alt="" className="h-full w-full object-cover" />
            <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1 text-[10px] leading-4 text-white">
              {referenceVideoTag(i)}
            </span>
            <span className="pointer-events-none absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[10px] leading-4 text-white">
              {v.durationSeconds.toFixed(1)}s
            </span>
            <button
              type="button"
              onClick={() => removeVideo(v.key)}
              className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-xs text-white hover:bg-black"
            >
              ×
            </button>
          </div>
        ))}
        {videos.length < MAX_VIDEOS && (
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-neutral-700 text-xs text-neutral-500 hover:border-neutral-500 hover:text-neutral-300 disabled:opacity-50"
          >
            {uploading ? "..." : "＋ 動画追加"}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

// TODO: サーバー側でも動画の長さ/本数/合計時間を再検証する(現状はクライアント側検証のみ)。
// 直接API呼び出しでのバイパスを防ぐには、アップロード済みファイルのメタデータ解析
// (例: ffprobe等)をAPIルート側に実装する必要があるが、大幅なスコープ増になるため
// 今回はTODOとして明示するに留める。

export type { UploadedVideo };
