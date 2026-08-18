"use client";

import { useRef, useState } from "react";
import { referenceImageTag } from "@/lib/generation/mention";

interface UploadedImage {
  key: string;
  previewUrl: string;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/bmp", "image/tiff", "image/gif"];
const MAX_IMAGES = 9;

export function ImageUploadField({
  images,
  onChange,
  label = "参照画像",
}: {
  images: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  label?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceKeyRef = useRef<string | null>(null);

  async function uploadFile(file: File): Promise<UploadedImage | null> {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(`未対応のファイル形式です: ${file.name}`);
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
      const remaining = MAX_IMAGES - images.length;
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

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-neutral-300">
        {label} <span className="text-neutral-500">({images.length}/{MAX_IMAGES})</span>
      </p>
      {images.length > 0 && (
        <p className="mb-2 text-xs text-neutral-500">
          プロンプト内で @image1 のように入力すると、対応する画像を参照として指定できます。画像をクリックすると差し替えられます
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {images.map((img, i) => (
          <div key={img.key} className="group relative h-20 w-20 overflow-hidden rounded-md border border-neutral-700">
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
            <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1 text-[10px] leading-4 text-white">
              {referenceImageTag(i)}
            </span>
            <button
              type="button"
              onClick={() => removeImage(img.key)}
              className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-xs text-white hover:bg-black"
            >
              ×
            </button>
          </div>
        ))}
        {images.length < MAX_IMAGES && (
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-neutral-700 text-xs text-neutral-500 hover:border-neutral-500 hover:text-neutral-300 disabled:opacity-50"
          >
            {uploading ? "..." : "＋ 画像追加"}
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
      <input
        ref={replaceInputRef}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        className="hidden"
        onChange={(e) => handleReplaceFile(e.target.files)}
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

export type { UploadedImage };
