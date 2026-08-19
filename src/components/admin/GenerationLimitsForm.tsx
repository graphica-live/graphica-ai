"use client";

import { useEffect, useState } from "react";
import {
  RESOLUTIONS,
  DURATIONS,
  ASPECT_RATIOS,
  GENERATION_MODES,
  GENERATION_MODE_LABELS,
} from "@/lib/generation/options";

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function GenerationLimitsForm({
  staffId,
  allowedResolutions,
  allowedDurations,
  allowedAspectRatios,
  allowedGenerationModes,
  onSaved,
}: {
  staffId: string;
  allowedResolutions: string[];
  allowedDurations: number[];
  allowedAspectRatios: string[];
  allowedGenerationModes: string[];
  onSaved: () => void;
}) {
  const [resolutions, setResolutions] = useState(allowedResolutions);
  const [durations, setDurations] = useState(allowedDurations);
  const [aspectRatios, setAspectRatios] = useState(allowedAspectRatios);
  const [modes, setModes] = useState(allowedGenerationModes);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResolutions(allowedResolutions);
    setDurations(allowedDurations);
    setAspectRatios(allowedAspectRatios);
    setModes(allowedGenerationModes);
  }, [allowedResolutions, allowedDurations, allowedAspectRatios, allowedGenerationModes]);

  const invalid =
    resolutions.length === 0 ||
    durations.length === 0 ||
    aspectRatios.length === 0 ||
    modes.length === 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (invalid) {
      setError("各項目とも1つ以上選択してください");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/staff/${staffId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowedResolutions: resolutions,
          allowedDurations: durations,
          allowedAspectRatios: aspectRatios,
          allowedGenerationModes: modes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "保存に失敗しました");
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
        <p className="mb-2 text-xs text-neutral-500">生成モード</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          {GENERATION_MODES.map((m) => (
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
          <p className="mb-2 text-xs text-neutral-500">解像度</p>
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
          <p className="mb-2 text-xs text-neutral-500">長さ(秒)</p>
          <div className="space-y-1">
            {DURATIONS.map((d) => (
              <label key={d} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={durations.includes(d)}
                  onChange={() => setDurations((prev) => toggle(prev, d))}
                />
                {d}秒
              </label>
            ))}
          </div>
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
