"use client";

import { useRef, useState } from "react";

interface UploadedAudio {
  key: string;
  filename: string;
  durationSeconds: number;
}

function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const objectUrl = URL.createObjectURL(file);
    audio.src = objectUrl;

    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      URL.revokeObjectURL(objectUrl);
      if (!Number.isFinite(duration)) {
        reject(new Error("音声の長さを取得できませんでした"));
        return;
      }
      resolve(duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("音声の読み込みに失敗しました"));
    };
  });
}

/**
 * MiniMax H3 の参照音声アップロード。
 *
 * 画像・動画と違いサムネイルを作れないため、ファイル名と長さを並べたリストで表示する。
 * 番号(音声1, 音声2...)は送信時の content[] の並び順と一致する。
 */
export function AudioUploadField({
  audios,
  onChange,
  label = "参照音声",
  maxAudios,
  allowedTypes,
  maxBytes,
  minDurationSeconds,
  maxDurationSeconds,
  maxTotalDurationSeconds,
  tagFor,
  hint,
}: {
  audios: UploadedAudio[];
  onChange: (audios: UploadedAudio[]) => void;
  label?: string;
  maxAudios: number;
  allowedTypes: readonly string[];
  maxBytes: number;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  maxTotalDurationSeconds: number;
  tagFor: (index: number) => string;
  hint?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const maxMb = Math.round(maxBytes / 1024 / 1024);

  async function uploadFile(file: File, totalSecondsSoFar: number): Promise<UploadedAudio | null> {
    if (!allowedTypes.includes(file.type)) {
      setError(`未対応のファイル形式です: ${file.name}(WAV / MP3のみ対応)`);
      return null;
    }
    if (file.size > maxBytes) {
      setError(`ファイルサイズが上限(${maxMb}MB)を超えています: ${file.name}`);
      return null;
    }

    let durationSeconds: number;
    try {
      durationSeconds = await readAudioDuration(file);
    } catch {
      setError(`音声の読み込みに失敗しました: ${file.name}`);
      return null;
    }

    if (durationSeconds < minDurationSeconds || durationSeconds > maxDurationSeconds) {
      setError(
        `音声は${minDurationSeconds}〜${maxDurationSeconds}秒の範囲にしてください: ${file.name}(${durationSeconds.toFixed(1)}秒)`
      );
      return null;
    }
    if (totalSecondsSoFar + durationSeconds > maxTotalDurationSeconds) {
      setError(`参照音声の合計時間が${maxTotalDurationSeconds}秒を超えています: ${file.name}`);
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

    return { key, filename: file.name, durationSeconds };
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const remaining = maxAudios - audios.length;
      const filesToUpload = Array.from(files).slice(0, remaining);

      let totalSecondsSoFar = audios.reduce((sum, a) => sum + a.durationSeconds, 0);
      const uploaded: UploadedAudio[] = [];
      for (const file of filesToUpload) {
        const result = await uploadFile(file, totalSecondsSoFar);
        if (result) {
          uploaded.push(result);
          totalSecondsSoFar += result.durationSeconds;
        }
      }

      onChange([...audios, ...uploaded]);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeAudio(key: string) {
    onChange(audios.filter((a) => a.key !== key));
  }

  const totalSeconds = audios.reduce((sum, a) => sum + a.durationSeconds, 0);

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-neutral-300">
        {label}{" "}
        <span className="text-neutral-500">
          ({audios.length}/{maxAudios}, 合計{totalSeconds.toFixed(1)}/{maxTotalDurationSeconds}秒)
        </span>
      </p>
      {audios.length > 0 && hint && <p className="mb-2 text-xs text-neutral-500">{hint}</p>}
      <ul className="space-y-2">
        {audios.map((a, i) => (
          <li
            key={a.key}
            className="flex items-center gap-3 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2"
          >
            <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] leading-4 text-neutral-300">
              {tagFor(i)}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-neutral-300">{a.filename}</span>
            <span className="shrink-0 text-xs tabular-nums text-neutral-500">
              {a.durationSeconds.toFixed(1)}s
            </span>
            <button
              type="button"
              onClick={() => removeAudio(a.key)}
              aria-label="削除"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {audios.length < maxAudios && (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className={`${audios.length > 0 ? "mt-2 " : ""}w-full rounded-md border border-dashed border-neutral-700 px-3 py-3 text-xs text-neutral-500 hover:border-neutral-500 hover:text-neutral-300 disabled:opacity-50`}
        >
          {uploading ? "..." : "＋ 音声追加"}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={allowedTypes.join(",")}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

export type { UploadedAudio };
