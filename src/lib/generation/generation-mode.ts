import type { GenerationMode } from "./options";
import { GENERATION_MODES } from "./options";

/**
 * ジョブの生成モードを解決する。
 *
 * `GenerationJob.generationMode` は nullable として追加した。ローリングデプロイ中は
 * generationMode を知らない旧コードもジョブを作り続けるため、DB default を置いて
 * しまうと旧コードが作った image ジョブに 'reference' が入って誤分類される。
 * 列が NULL の行は、旧コードでも必ず書かれている firstFrameImageKey の有無から導出する
 * (旧コードの生成モードは reference / image の2種類しかない)。
 *
 * 旧コンテナが完全に消えた後のリリースで backfill して NOT NULL 化する。
 */
export function resolveGenerationMode(job: {
  generationMode: string | null;
  firstFrameImageKey: string | null;
}): GenerationMode {
  if (job.generationMode && (GENERATION_MODES as readonly string[]).includes(job.generationMode)) {
    return job.generationMode as GenerationMode;
  }
  return job.firstFrameImageKey ? "image" : "reference";
}
