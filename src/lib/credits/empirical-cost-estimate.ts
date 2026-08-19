// 本番で実際に完了した生成ジョブのトークン消費実測値からコストを概算する。
// 該当パターンの実測データがまだ無い場合は、静的な概算諸元(2026-08時点、動画入力なし基準)を
// 5秒/30秒間で線形補間したfallbackを使う。

const USD_TO_JPY_RATE = 159;

// $/100万トークン (動画入力なし基準。BytePlus Ark Console実測、2026-08時点)
const RATE_USD_PER_MILLION_TOKENS: Record<string, number> = {
  "480p": 10.7,
  "720p": 10.7,
};

// 実測データが無い場合のfallback参照値(5秒・30秒時点、動画入力なし)
const STATIC_FALLBACK_USD: Record<string, { at5s: number; at30s: number }> = {
  "480p": { at5s: 0.51, at30s: 3.09 },
  "720p": { at5s: 1.16, at30s: 6.93 },
};

export interface CostSample {
  resolution: string;
  aspectRatio: string;
  hasReferenceImages: boolean;
  hasFirstFrame: boolean;
  hasEndFrame: boolean;
  avgTokensPerSecond: number;
  sampleCount: number;
}

export interface EstimatePattern {
  resolution: string;
  aspectRatio: string;
  durationSeconds: number;
  hasReferenceImages: boolean;
  hasFirstFrame: boolean;
  hasEndFrame: boolean;
}

function interpolateUsd(table: { at5s: number; at30s: number }, durationSeconds: number): number {
  const ratio = (durationSeconds - 5) / (30 - 5);
  return table.at5s + (table.at30s - table.at5s) * ratio;
}

/**
 * 実測サンプルからパターン一致するものを探し、秒あたりトークン数を目的の秒数にスケールして
 * JPYコストを返す。一致するサンプルが無ければ静的な概算諸元を線形補間する。
 * どちらも無ければnullを返す(呼び出し側で数式ベース概算にfallbackすること)。
 */
export function estimateCostJpy(samples: CostSample[], pattern: EstimatePattern): number | null {
  const match = samples.find(
    (s) =>
      s.resolution === pattern.resolution &&
      s.aspectRatio === pattern.aspectRatio &&
      s.hasReferenceImages === pattern.hasReferenceImages &&
      s.hasFirstFrame === pattern.hasFirstFrame &&
      s.hasEndFrame === pattern.hasEndFrame
  );
  const rate = RATE_USD_PER_MILLION_TOKENS[pattern.resolution];

  if (match && rate) {
    const tokens = match.avgTokensPerSecond * pattern.durationSeconds;
    const usd = (tokens / 1_000_000) * rate;
    return usd * USD_TO_JPY_RATE;
  }

  const fallback = STATIC_FALLBACK_USD[pattern.resolution];
  if (fallback) {
    return interpolateUsd(fallback, pattern.durationSeconds) * USD_TO_JPY_RATE;
  }

  return null;
}
