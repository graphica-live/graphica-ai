"use client";

import { useRef, useState } from "react";
import { referenceImageTag } from "@/lib/generation/mention";

interface UploadedImage {
  key: string;
  previewUrl: string;
}

const DEFAULT_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "image/gif",
];
const DEFAULT_MAX_IMAGES = 9;

/**
 * サムネイルの並べ方。
 * - inline: 80px固定の折り返し(Seedanceフォームの既存レイアウト)
 * - grid: 画面幅に追従する正方形グリッド。9枚並べてもスマートフォンで崩れない
 */
type UploadLayout = "inline" | "grid";

export function ImageUploadField({
  images,
  onChange,
  label = "参照画像",
  maxImages = DEFAULT_MAX_IMAGES,
  /** @image1 バッジとメンション説明を表示するか。先頭/末尾フレーム用途では無意味なのでfalseにする */
  showTag = true,
  allowedTypes = DEFAULT_ALLOWED_TYPES,
  maxBytes,
  tagFor = referenceImageTag,
  hint,
  layout = "inline",
}: {
  images: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  label?: string;
  maxImages?: number;
  showTag?: boolean;
  allowedTypes?: readonly string[];
  maxBytes?: number;
  /** バッジに出す表記。H3では並び順がそのままAPIの参照順になるため「画像1」等を出す */
  tagFor?: (index: number) => string;
  /** 素材が1件以上あるときに出す補助文。未指定ならメンション前提の既定文言 */
  hint?: string;
  layout?: UploadLayout;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceKeyRef = useRef<string | null>(null);

  const isGrid = layout === "grid";
  const tileClass = isGrid ? "aspect-square w-full" : "h-20 w-20";
  const removeButtonClass = isGrid ? "h-7 w-7 text-sm" : "h-5 w-5 text-xs";

  async function uploadFile(file: File): Promise<UploadedImage | null> {
    if (!allowedTypes.includes(file.type)) {
      setError(`未対応のファイル形式です: ${file.name}`);
      return null;
    }
    if (maxBytes !== undefined && file.size > maxBytes) {
      setError(
        `ファイルサイズが上限(${Math.round(maxBytes / 1024 / 1024)}MB)を超えています: ${file.name}`
      );
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

    return { key, previewUrl: URL.createObjectURL(file) };
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const remaining = maxImages - images.length;
      const filesToUpload = Array.from(files).slice(0, remaining);

      const uploaded: UploadedImage[] = [];
      for (const file of filesToUpload) {
        const result = await uploadFile(file);
        if (result) uploaded.push(result);
      }

      onChange([...images, ...uploaded]);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleReplaceFile(files: FileList | null) {
    const file = files?.[0];
    const targetKey = replaceKeyRef.current;
    if (!file || !targetKey) return;
    setError(null);
    setUploading(true);
    try {
      const result = await uploadFile(file);
      if (result) {
        onChange(images.map((img) => (img.key === targetKey ? result : img)));
      }
    } finally {
      setUploading(false);
      replaceKeyRef.current = null;
      if (replaceInputRef.current) replaceInputRef.current.value = "";
    }
  }

  function removeImage(key: string) {
    onChange(images.filter((img) => img.key !== key));
  }

  function startReplace(key: string) {
    replaceKeyRef.current = key;
    replaceInputRef.current?.click();
  }

  const defaultHint = showTag
    ? "プロンプト内で @image1 のように入力すると、対応する画像を参照として指定できます。画像をクリックすると差し替えられます"
    : "画像をクリックすると差し替えられます";

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-neutral-300">
        {label} <span className="text-neutral-500">({images.length}/{maxImages})</span>
      </p>
      {images.length > 0 && (
        <p className="mb-2 text-xs text-neutral-500">{hint ?? defaultHint}</p>
      )}
      <div
        className={
          isGrid ? "grid grid-cols-3 gap-3 sm:grid-cols-4" : "flex flex-wrap gap-3"
        }
      >
        {images.map((img, i) => (
          <div
            key={img.key}
            className={`group relative overflow-hidden rounded-md border border-neutral-700 ${tileClass}`}
          >
            <button
              type="button"
              disabled={uploading}
              onClick={() => startReplace(img.key)}
              className="block h-full w-full disabled:opacity-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.previewUrl} alt="" className="h-full w-full object-cover" />
              <span className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/60 text-[10px] text-white group-hover:flex">
                差し替え
              </span>
            </button>
            {showTag && (
              <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1 text-[10px] leading-4 text-white">
                {tagFor(i)}
              </span>
            )}
            <button
              type="button"
              onClick={() => removeImage(img.key)}
              aria-label="削除"
              className={`absolute right-0.5 top-0.5 flex items-center justify-center rounded-full bg-black/70 text-white hover:bg-black ${removeButtonClass}`}
            >
              ×
            </button>
          </div>
        ))}
        {images.length < maxImages && (
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-neutral-700 text-xs text-neutral-500 hover:border-neutral-500 hover:text-neutral-300 disabled:opacity-50 ${tileClass}`}
          >
            {uploading ? "..." : "＋ 画像追加"}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={allowedTypes.join(",")}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept={allowedTypes.join(",")}
        className="hidden"
        onChange={(e) => handleReplaceFile(e.target.files)}
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

export type { UploadedImage };
