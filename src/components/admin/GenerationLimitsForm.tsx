"use client";

import { useEffect, useState } from "react";
import {
  RESOLUTIONS,
  ASPECT_RATIOS,
  GENERATION_MODE_LABELS,
  DURATION_MIN_SECONDS,
  DURATION_MAX_SECONDS,
} from "@/lib/generation/options";
import { VIDEO_MODELS, getModelSpec } from "@/lib/generation/models";

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

// 解像度と生成モードの許可設定は Seedance 2.5 専用。MiniMax H3 の可否はモデル欄で制御する
// (理由は prisma/schema.prisma の allowedGenerationModes のコメントを参照)。
const SEEDANCE_MODES = getModelSpec("seedance-2.5").modes;

export function GenerationLimitsForm({
  staffId,
  allowedModels,
  allowedResolutions,
  minDurationSeconds,
  maxDurationSeconds,
  allowedAspectRatios,
  allowedGenerationModes,
  onSaved,
}: {
  staffId: string;
  allowedModels: string[];
  allowedResolutions: string[];
  minDurationSeconds: number;
  maxDurationSeconds: number;
  allowedAspectRatios: string[];
  allowedGenerationModes: string[];
  onSaved: () => void;
}) {
  const [models, setModels] = useState(allowedModels);
  const [resolutions, setResolutions] = useState(allowedResolutions);
  // 入力途中の空文字をNaN/0と取り違えないよう、秒数は文字列で保持して送信時に数値化する
  const [minDuration, setMinDuration] = useState(String(minDurationSeconds));
  const [maxDuration, setMaxDuration] = useState(String(maxDurationSeconds));
  const [aspectRatios, setAspectRatios] = useState(allowedAspectRatios);
  const [modes, setModes] = useState(allowedGenerationModes);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setModels(allowedModels);
    setResolutions(allowedResolutions);
    setMinDuration(String(minDurationSeconds));
    setMaxDuration(String(maxDurationSeconds));
    setAspectRatios(allowedAspectRatios);
    setModes(allowedGenerationModes);
  }, [
    allowedModels,
    allowedResolutions,
    minDurationSeconds,
    maxDurationSeconds,
    allowedAspectRatios,
    allowedGenerationModes,
  ]);

  const parsedMin = Number(minDuration);
  const parsedMax = Number(maxDuration);
  const durationInvalid =
    minDuration.trim() === "" ||
    maxDuration.trim() === "" ||
    !Number.isInteger(parsedMin) ||
    !Number.isInteger(parsedMax) ||
    parsedMin < DURATION_MIN_SECONDS ||
    parsedMax > DURATION_MAX_SECONDS ||
    parsedMin > parsedMax;

  const invalid =
    models.length === 0 ||
    resolutions.length === 0 ||
    durationInvalid ||
    aspectRatios.length === 0 ||
    modes.length === 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (invalid) {
      setError(
        durationInvalid
          ? `長さは${DURATION_MIN_SECONDS}〜${DURATION_MAX_SECONDS}秒の整数で、下限≦上限にしてください`
          : "各項目とも1つ以上選択してください"
      );
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/staff/${staffId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowedModels: models,
          allowedResolutions: resolutions,
          minDurationSeconds: parsedMin,
          maxDurationSeconds: parsedMax,
          allowedAspectRatios: aspectRatios,
          allowedGenerationModes: modes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "保存に失敗しました");
        return;
      }
      onSaved();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-neutral-800 p-4"
    >
      <div>
        <p className="mb-2 text-xs text-neutral-500">利用できるモデル</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          {VIDEO_MODELS.map((id) => (
            <label key={id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={models.includes(id)}
                onChange={() => setModels((prev) => toggle(prev, id))}
              />
              {getModelSpec(id).label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs text-neutral-500">生成モード (Seedance 2.5)</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          {SEEDANCE_MODES.map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={modes.includes(m)}
                onChange={() => setModes((prev) => toggle(prev, m))}
              />
              {GENERATION_MODE_LABELS[m]}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="mb-2 text-xs text-neutral-500">解像度 (Seedance 2.5)</p>
          <div className="space-y-1">
            {RESOLUTIONS.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={resolutions.includes(r)}
                  onChange={() => setResolutions((prev) => toggle(prev, r))}
                />
                {r}
              </label>
            ))}
          </div>
        </div>
        <div>
          {/* 生成フォームは1秒刻みのスライダーなので、許可も個別値ではなく範囲で指定する */}
          <p className="mb-2 text-xs text-neutral-500">長さ(秒)</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={DURATION_MIN_SECONDS}
              max={DURATION_MAX_SECONDS}
              step={1}
              value={minDuration}
              onChange={(e) => setMinDuration(e.target.value)}
              aria-label="長さの下限(秒)"
              className="w-16 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
            />
            <span className="text-xs text-neutral-500">〜</span>
            <input
              type="number"
              inputMode="numeric"
              min={DURATION_MIN_SECONDS}
              max={DURATION_MAX_SECONDS}
              step={1}
              value={maxDuration}
              onChange={(e) => setMaxDuration(e.target.value)}
              aria-label="長さの上限(秒)"
              className="w-16 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
            />
          </div>
          <p className="mt-1 text-xs text-neutral-600">
            {DURATION_MIN_SECONDS}〜{DURATION_MAX_SECONDS}秒(全モデル共通。H3は最大15秒)
          </p>
        </div>
        <div>
          <p className="mb-2 text-xs text-neutral-500">アスペクト比</p>
          <div className="space-y-1">
            {ASPECT_RATIOS.map((a) => (
              <label key={a} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={aspectRatios.includes(a)}
                  onChange={() => setAspectRatios((prev) => toggle(prev, a))}
                />
                {a}
              </label>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting || invalid}
        className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-50"
      >
        保存
      </button>
    </form>
  );
}
