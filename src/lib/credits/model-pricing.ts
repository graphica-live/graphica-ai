// MiniMax H3 のAPI使用料原価を算出する。
//
// 料金の数値はこのファイルだけに置く。値上げ・値下げがあってもここ1箇所の変更で済ませる。
// 出典: https://platform.minimax.io/docs/guides/pricing-paygo (2026-08-24 確認)

import type { ProviderUsage } from "@/lib/video-provider/types";

/** 概算換算用の固定レート。実勢レートと乖離するため定期的に見直すこと。 */
export const USD_TO_JPY_RATE = 159;

export const MINIMAX_H3_PRICING = {
  /** 出力動画の秒単価(USD) */
  outputUsdPerSecond: { "768P": 0.08, "2K": 0.13 } as Record<string, number>,
  /** 入力動画は「入力尺 × 出力解像度の単価」で課金される */
  inputVideoUsdPerSecond: { "768P": 0.08, "2K": 0.13 } as Record<string, number>,
  /** 入力画像は先頭5枚まで無料 */
  freeInputImages: 5,
  extraInputImageUsd: 0.04,
  /** 入力音声は無料 */
  inputAudioUsd: 0,
  /** APIが受け付ける入力動画の合計上限(秒)。与信はこの値で満額予約する */
  maxInputVideoSeconds: 15,
} as const;

/** 単価が定義されていない解像度が課金経路に来た場合に投げる。 */
export class UnknownH3ResolutionError extends Error {}

function outputRate(resolution: string): number {
  const rate = MINIMAX_H3_PRICING.outputUsdPerSecond[resolution];
  if (rate === undefined) {
    throw new UnknownH3ResolutionError(`単価が未定義の解像度です: ${resolution}`);
  }
  return rate;
}

function inputVideoRate(resolution: string): number {
  const rate = MINIMAX_H3_PRICING.inputVideoUsdPerSecond[resolution];
  if (rate === undefined) {
    throw new UnknownH3ResolutionError(`単価が未定義の解像度です: ${resolution}`);
  }
  return rate;
}

function extraImageUsd(referenceImageCount: number): number {
  const billable = Math.max(0, referenceImageCount - MINIMAX_H3_PRICING.freeInputImages);
  return billable * MINIMAX_H3_PRICING.extraInputImageUsd;
}

export function jpyFromUsd(usd: number): number {
  return Math.ceil(usd * USD_TO_JPY_RATE);
}

/**
 * 生成前に仮押さえする1本あたりの概算原価(円)。
 *
 * 参照動画の実尺はサーバー側で検証できない（クライアントの申告値は課金経路に持ち込まない）。
 * 過少に仮押さえすると、外部APIでは課金が発生しているのに残高チェックを通過してしまう
 * ため、参照動画が1本でもあればAPI上限の15秒ぶんを満額で予約する。
 * 差額は完了時に MiniMax が報告する input_seconds で返金される。
 */
export function estimateH3CostJpy(params: {
  resolution: string;
  durationSeconds: number;
  referenceImageCount: number;
  hasReferenceVideo: boolean;
}): number {
  const usd =
    outputRate(params.resolution) * params.durationSeconds +
    extraImageUsd(params.referenceImageCount) +
    (params.hasReferenceVideo
      ? inputVideoRate(params.resolution) * MINIMAX_H3_PRICING.maxInputVideoSeconds
      : 0);
  return jpyFromUsd(usd);
}

function isSaneSeconds(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 3600;
}

function isSaneCount(value: number | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1000;
}

/**
 * MiniMax が報告した使用量から確定原価(円)を返す。
 *
 * 課金額の入力を外部レスポンスから受け取るため、型だけを信用せず実行時に検証する。
 * 出力秒が信用できない場合はnullを返し、呼び出し側は仮押さえ額のまま確定させる。
 */
export function actualH3CostJpy(
  resolution: string,
  usage: ProviderUsage | undefined | null
): number | null {
  if (!usage) return null;
  if (!isSaneSeconds(usage.outputSeconds) || usage.outputSeconds <= 0) return null;

  const inputSeconds = isSaneSeconds(usage.inputSeconds) ? usage.inputSeconds : 0;
  const imageCount = isSaneCount(usage.inputImageCount) ? usage.inputImageCount : 0;

  let usd: number;
  try {
    usd =
      outputRate(resolution) * usage.outputSeconds +
      inputVideoRate(resolution) * inputSeconds +
      extraImageUsd(imageCount);
  } catch {
    return null;
  }
  return jpyFromUsd(usd);
}
