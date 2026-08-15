"use client";

import { useRef, useState } from "react";

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

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const remaining = MAX_IMAGES - images.length;
      const filesToUpload = Array.from(files).slice(0, remaining);

      const uploaded: UploadedImage[] = [];
      for (const file of filesToUpload) {
        if (!ALLOWED_TYPES.includes(file.type)) {
          setError(`未対応のファイル形式です: ${file.name}`);
          continue;
        }
        const presignRes = await fetch("/api/uploads/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, contentType: file.type }),
        });
        if (!presignRes.ok) {
          setError("アップロードURLの発行に失敗しました");
          continue;
        }
        const { key, uploadUrl } = await presignRes.json();

        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!putRes.ok) {
          setError(`アップロードに失敗しました: ${file.name}`);
          continue;
        }

        uploaded.push({ key, previewUrl: URL.createObjectURL(file) });
      }

      onChange([...images, ...uploaded]);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeImage(key: string) {
    onChange(images.filter((img) => img.key !== key));
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-neutral-300">
        {label} <span className="text-neutral-500">({images.length}/{MAX_IMAGES})</span>
      </p>
      <div className="flex flex-wrap gap-3">
        {images.map((img) => (
          <div key={img.key} className="relative h-20 w-20 overflow-hidden rounded-md border border-neutral-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.previewUrl} alt="" className="h-full w-full object-cover" />
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
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

export type { UploadedImage };
