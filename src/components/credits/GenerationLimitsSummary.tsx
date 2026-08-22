import {
  RESOLUTIONS,
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
  minDurationSeconds,
  maxDurationSeconds,
  allowedAspectRatios,
  allowedGenerationModes,
}: {
  allowedResolutions: string[];
  minDurationSeconds: number;
  maxDurationSeconds: number;
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
      {/* 長さは1秒刻みのスライダーで選ぶため、選択肢の羅列ではなく許可範囲を示す */}
      <div>
        <p className="mb-2 text-xs text-neutral-500">長さ</p>
        <span className="inline-block rounded-md border border-neutral-600 bg-neutral-800 px-2.5 py-1 text-sm text-neutral-100">
          {minDurationSeconds >= maxDurationSeconds
            ? `${minDurationSeconds}秒`
            : `${minDurationSeconds}〜${maxDurationSeconds}秒(1秒刻み)`}
        </span>
      </div>
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
