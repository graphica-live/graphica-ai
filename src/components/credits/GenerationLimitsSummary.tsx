import {
  RESOLUTIONS,
  DURATIONS,
  ASPECT_RATIOS,
  GENERATION_MODES,
  GENERATION_MODE_LABELS,
} from "@/lib/generation/options";

// 管理画面の GenerationLimitsForm と同じ選択肢を、閲覧専用で表示する。
// 全選択肢を並べたうえで許可済みを強調し、利用できない項目は取り消し線で示す。

function LimitGroup({
  label,
  options,
}: {
  label: string;
  options: { key: string; text: string; allowed: boolean }[];
}) {
  return (
    <div>
      <p className="mb-2 text-xs text-neutral-500">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <span
            key={o.key}
            className={
              o.allowed
                ? "rounded-md border border-neutral-600 bg-neutral-800 px-2.5 py-1 text-sm text-neutral-100"
                : "rounded-md border border-neutral-900 px-2.5 py-1 text-sm text-neutral-600 line-through"
            }
          >
            {o.text}
          </span>
        ))}
      </div>
    </div>
  );
}

export function GenerationLimitsSummary({
  allowedResolutions,
  allowedDurations,
  allowedAspectRatios,
  allowedGenerationModes,
}: {
  allowedResolutions: string[];
  allowedDurations: number[];
  allowedAspectRatios: string[];
  allowedGenerationModes: string[];
}) {
  return (
    <div className="space-y-4 rounded-lg border border-neutral-800 p-6">
      <LimitGroup
        label="生成モード"
        options={GENERATION_MODES.map((m) => ({
          key: m,
          text: GENERATION_MODE_LABELS[m],
          allowed: allowedGenerationModes.includes(m),
        }))}
      />
      <LimitGroup
        label="解像度"
        options={RESOLUTIONS.map((r) => ({
          key: r,
          text: r,
          allowed: allowedResolutions.includes(r),
        }))}
      />
      <LimitGroup
        label="長さ"
        options={DURATIONS.map((d) => ({
          key: String(d),
          text: `${d}秒`,
          allowed: allowedDurations.includes(d),
        }))}
      />
      <LimitGroup
        label="アスペクト比"
        options={ASPECT_RATIOS.map((a) => ({
          key: a,
          text: a,
          allowed: allowedAspectRatios.includes(a),
        }))}
      />
      <p className="text-xs text-neutral-500">
        取り消し線の項目は利用できません。変更は管理者のみ行えます。
      </p>
    </div>
  );
}
