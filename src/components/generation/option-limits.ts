import { LEGACY_VIDEO_MODEL } from "@/lib/generation/models";

export interface GenerationOptionLimits {
  allowedResolutions: string[];
  // 動画長は1秒刻みのスライダーで選ぶため、許可リストではなく下限・上限で受け取る
  minDurationSeconds: number;
  maxDurationSeconds: number;
  allowedAspectRatios: string[];
  allowedGenerationModes: string[];
  allowedModels: string[];
}

/**
 * /api/generate/options はエラー時に {error} を返すため、形にそぐわないレスポンスを
 * そのまま制限として採用しない(採用すると allowedXxx が undefined になり描画時に落ちる)。
 *
 * allowedModels は後から追加したフィールドなので任意扱いにする。欠けている場合は
 * 従来モデル(Seedance)だけを許可する fail-closed なフォールバックにして、
 * 未知のサーバーに対して新しいモデルを勝手に有効化しない。
 */
export function isGenerationOptionLimits(value: unknown): value is GenerationOptionLimits {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.allowedResolutions) &&
    typeof v.minDurationSeconds === "number" &&
    typeof v.maxDurationSeconds === "number" &&
    Array.isArray(v.allowedAspectRatios) &&
    Array.isArray(v.allowedGenerationModes)
  );
}

export function normalizeOptionLimits(value: unknown): GenerationOptionLimits | null {
  if (!isGenerationOptionLimits(value)) return null;
  const raw = value as unknown as Record<string, unknown>;
  return {
    ...value,
    allowedModels: Array.isArray(raw.allowedModels)
      ? (raw.allowedModels as string[])
      : [LEGACY_VIDEO_MODEL],
  };
}
