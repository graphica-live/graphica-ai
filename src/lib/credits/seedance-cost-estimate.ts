// BytePlus ModelArk seedance-1.0-pro の公式料金体系(2026-08時点)に基づく実費概算。
// トークン数 = 幅×高さ×フレームレート×秒数 / 1024、単価 $2.5 / 1,000,000トークン (T2V/I2V同額)。
// 参照: https://www.byteplus.com/en/blog/seedance-1-0-pro-guide-api-pricing
const FPS = 24;
const PRICE_PER_MILLION_TOKENS_USD = 2.5;

// 概算換算用の固定レート。実勢レートと乖離するため定期的に見直すこと。
const USD_TO_JPY_RATE = 159;

// 解像度ごとの想定ピクセル面積。公式料金表(16:9)の実測値に基づく。
// アスペクト比が変わっても同一解像度なら面積はほぼ一定(±4%程度)のため、
// 概算目的ではアスペクト比を区別せずこの面積を共通で使う。
// 720pはpro向け公式料金表に記載がなく、lite実測値($0.18〜0.20/720p・5秒)から逆算した近似値。
const RESOLUTION_PIXEL_AREA: Record<string, number> = {
  "480p": 864 * 480,
  "720p": 1248 * 704,
  "1080p": 1920 * 1088,
};

export function estimateSeedanceTokens(
  resolution: string,
  durationSeconds: number
): number | null {
  const area = RESOLUTION_PIXEL_AREA[resolution];
  if (!area) return null;
  return Math.round((area * FPS * durationSeconds) / 1024);
}

export function estimateSeedanceCostUsd(
  resolution: string,
  durationSeconds: number
): number | null {
  const tokens = estimateSeedanceTokens(resolution, durationSeconds);
  if (tokens === null) return null;
  return (tokens / 1_000_000) * PRICE_PER_MILLION_TOKENS_USD;
}

export function estimateSeedanceCostJpy(
  resolution: string,
  durationSeconds: number
): number | null {
  const usd = estimateSeedanceCostUsd(resolution, durationSeconds);
  if (usd === null) return null;
  return usd * USD_TO_JPY_RATE;
}
