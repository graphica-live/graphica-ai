// Seedance 2.5 のAPI使用料原価を算出する。
// スタッフのクレジット残高から引く額は、このファイルの計算結果だけで決まる。
//
// 生成前は公式のトークン計算式で概算して仮押さえし、完了後にプロバイダが報告した
// 実トークン数(usage.total_tokens)で確定させる。実測サンプルの平均値のような
// 履歴依存の値を課金経路に持ち込まないことで、同じ入力なら常に同じ額を仮押さえできる。

// BytePlus ModelArk の Seedance 2.5 トークン単価(2026-08時点)。
// 動画入力(reference video)の有無で単価が変わる。解像度別の差は公式表にない。
const USD_PER_MILLION_TOKENS = {
  withVideoInput: 6.4,
  withoutVideoInput: 10.7,
} as const;

// 概算換算用の固定レート。実勢レートと乖離するため定期的に見直すこと。
const USD_TO_JPY_RATE = 159;

const FPS = 24;

// 解像度ごとの想定ピクセル面積。公式料金表(16:9)の実測値に基づく。
// アスペクト比が変わっても同一解像度なら面積はほぼ一定(±4%程度)のため、
// 概算目的ではアスペクト比を区別せずこの面積を共通で使う。
const RESOLUTION_PIXEL_AREA: Record<string, number> = {
  "480p": 864 * 480,
  "720p": 1248 * 704,
  "1080p": 1920 * 1088,
};

/** 単価が定義されていない解像度が課金経路に来た場合に投げる。 */
export class UnknownResolutionError extends Error {}

function usdPerMillionTokens(hasVideoInput: boolean) {
  return hasVideoInput
    ? USD_PER_MILLION_TOKENS.withVideoInput
    : USD_PER_MILLION_TOKENS.withoutVideoInput;
}

/**
 * 出力動画のトークン数を公式の計算式(幅 × 高さ × FPS × 秒 / 1024)で見積もる。
 *
 * 動画入力ありの場合、公式の課金トークンは入力動画の尺も加算されるが、
 * サーバーは参照動画の尺を保持していないため出力分のみで見積もる。
 * 不足分は完了時の実トークンによる差額精算で吸収する。
 */
export function estimateTokens(resolution: string, durationSeconds: number): number {
  const area = RESOLUTION_PIXEL_AREA[resolution];
  if (!area) {
    throw new UnknownResolutionError(`単価が未定義の解像度です: ${resolution}`);
  }
  return Math.round((area * FPS * durationSeconds) / 1024);
}

/** トークン数から原価(円・切り上げ)を返す。 */
export function costJpyFromTokens(totalTokens: number, hasVideoInput: boolean): number {
  const usd = (totalTokens / 1_000_000) * usdPerMillionTokens(hasVideoInput);
  return Math.ceil(usd * USD_TO_JPY_RATE);
}

/** 生成前に仮押さえする1本あたりの概算原価(円)。 */
export function estimateCostJpy(params: {
  resolution: string;
  durationSeconds: number;
  hasVideoInput: boolean;
}): number {
  return costJpyFromTokens(
    estimateTokens(params.resolution, params.durationSeconds),
    params.hasVideoInput
  );
}

/**
 * プロバイダが報告した実トークン数から確定原価(円)を返す。
 *
 * 課金額の入力を外部レスポンスから受け取るため、型だけを信用せず実行時に検証する。
 * 値が信用できない場合はnullを返し、呼び出し側は概算額のまま確定させる。
 */
export function actualCostJpy(
  totalTokens: number | null | undefined,
  hasVideoInput: boolean
): number | null {
  if (totalTokens == null) return null;
  if (!Number.isSafeInteger(totalTokens) || totalTokens <= 0) return null;
  return costJpyFromTokens(totalTokens, hasVideoInput);
}
