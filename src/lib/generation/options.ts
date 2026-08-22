export const RESOLUTIONS = ["480p", "720p", "1080p"] as const;
export const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3"] as const;

// Seedance 2.5の duration は 4〜30 の整数(1秒刻み)で、既定値は5秒。
// 生成フォームはこの範囲を1秒刻みのスライダーで選択させる。
export const DURATION_MIN_SECONDS = 4;
export const DURATION_MAX_SECONDS = 30;
export const DEFAULT_DURATION_SECONDS = 5;

/** 秒数を許可範囲(既定はSeedanceの上下限)に収める */
export function clampDurationSeconds(
  value: number,
  min: number = DURATION_MIN_SECONDS,
  max: number = DURATION_MAX_SECONDS
): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.round(value), min), max);
}

// 生成モード。UIのタブ、生成APIの排他検証、管理画面の許可設定で同じ値を使う。
export const GENERATION_MODES = ["reference", "image"] as const;

export const GENERATION_MODE_LABELS: Record<GenerationMode, string> = {
  reference: "テキスト・参照から生成",
  image: "画像から生成",
};

// 先頭フレーム画像から生成する場合(image to video)、Seedance 2.5は先頭フレームの
// アスペクト比を自動継承し ratio は "adaptive" のみサポートされる。ユーザーが選ぶ値では
// ないため ASPECT_RATIOS には含めない(選択UIと管理画面の許可設定に混入させない)。
export const ADAPTIVE_ASPECT_RATIO = "adaptive";

export type Resolution = (typeof RESOLUTIONS)[number];
export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export type GenerationMode = (typeof GENERATION_MODES)[number];
