import { z } from "zod";
import {
  ASPECT_RATIOS,
  RESOLUTIONS,
  DURATION_MIN_SECONDS,
  DURATION_MAX_SECONDS,
} from "@/lib/generation/options";
import { getModelSpec, LEGACY_VIDEO_MODEL } from "@/lib/generation/models";

// 生成リクエストのバリデーション。
//
// モデルごとに受け付ける形が違うため model を判別キーにした discriminated union にする。
// MiniMax H3 は first/last frame 方式と reference 方式が公式に "mutually exclusive" なので、
// UIのタブと同じ粒度の mode でさらに分岐し、モードごとに必須項目と併用不可項目を検証する。
//
// フロントの分岐だけに頼らず、ここで不正な組み合わせを必ず弾く。

const h3 = getModelSpec("minimax-h3");
const seedance = getModelSpec("seedance-2.5");

const keyArray = z.array(z.string().min(1));

const seedanceSchema = z
  .object({
    model: z.literal("seedance-2.5"),
    // Seedance が持たないモード(text/firstlast)を渡せないよう、拡張後の GENERATION_MODES
    // ではなくモデルが対応するモードだけを明示的に列挙する。
    mode: z.enum(["reference", "image"]).default("reference"),
    prompt: z.string().max(seedance.maxPromptLength).default(""),
    referenceImageKeys: keyArray.max(9).default([]),
    referenceVideoKeys: keyArray.max(10).default([]),
    firstFrameImageKey: z.string().min(1).optional(),
    endFrameImageKey: z.string().min(1).optional(),
    resolution: z.enum(RESOLUTIONS),
    // Seedance 2.5 が受け付ける duration の範囲。スタッフごとの範囲制限は別途DBの値で検証する。
    durationSeconds: z.number().int().min(DURATION_MIN_SECONDS).max(DURATION_MAX_SECONDS),
    aspectRatio: z.enum(ASPECT_RATIOS).optional(),
    generateAudio: z.boolean().default(true),
    batchSize: z.number().int().min(1).max(seedance.maxBatchSize).default(1),
  })
  .superRefine((body, ctx) => {
    if (body.mode === "image") {
      if (!body.firstFrameImageKey) {
        ctx.addIssue({
          code: "custom",
          message: "先頭フレーム画像(firstFrameImageKey)は必須です",
          path: ["firstFrameImageKey"],
        });
      }
      if (body.referenceImageKeys.length > 0 || body.referenceVideoKeys.length > 0) {
        ctx.addIssue({
          code: "custom",
          message: "画像から生成するモードでは参照画像・参照動画を同時に指定できません",
          path: ["referenceImageKeys"],
        });
      }
      return;
    }

    // mode === "reference"
    if (body.prompt.length < 1) {
      ctx.addIssue({ code: "custom", message: "プロンプトは必須です", path: ["prompt"] });
    }
    if (!body.aspectRatio) {
      ctx.addIssue({ code: "custom", message: "アスペクト比は必須です", path: ["aspectRatio"] });
    }
    if (body.firstFrameImageKey || body.endFrameImageKey) {
      ctx.addIssue({
        code: "custom",
        message: "先頭・末尾フレーム画像は「画像から生成」モードでのみ指定できます",
        path: ["firstFrameImageKey"],
      });
    }
  });

const minimaxSchema = z
  .object({
    model: z.literal("minimax-h3"),
    mode: z.enum(["image", "text", "firstlast", "reference"]).default("image"),
    prompt: z.string().max(h3.maxPromptLength),
    referenceImageKeys: keyArray.max(h3.limits.maxReferenceImages).default([]),
    referenceVideoKeys: keyArray.max(h3.limits.maxReferenceVideos).default([]),
    referenceAudioKeys: keyArray.max(h3.limits.maxReferenceAudios).default([]),
    firstFrameImageKey: z.string().min(1).optional(),
    endFrameImageKey: z.string().min(1).optional(),
    resolution: z.enum(["768P", "2K"]),
    durationSeconds: z.number().int().min(h3.durationMin).max(h3.durationMax),
    aspectRatio: z.enum(ASPECT_RATIOS).optional(),
    // 2K/15秒は1本で約$1.95。誤操作による高額生成を避けるため一括生成は許可しない。
    batchSize: z.literal(1).default(1),
  })
  .superRefine((body, ctx) => {
    // 公式リファレンス: "Every request must include one non-empty text item"
    if (body.prompt.trim().length < 1) {
      ctx.addIssue({ code: "custom", message: "プロンプトは必須です", path: ["prompt"] });
    }

    const referenceCount =
      body.referenceImageKeys.length +
      body.referenceVideoKeys.length +
      body.referenceAudioKeys.length;
    const usesFrames = body.mode === "image" || body.mode === "firstlast";

    if (usesFrames) {
      if (!body.firstFrameImageKey) {
        ctx.addIssue({
          code: "custom",
          message: "開始画像は必須です",
          path: ["firstFrameImageKey"],
        });
      }
      if (referenceCount > 0) {
        ctx.addIssue({
          code: "custom",
          message: "フレーム画像を使うモードでは参照素材を同時に指定できません",
          path: ["referenceImageKeys"],
        });
      }
    } else if (body.firstFrameImageKey || body.endFrameImageKey) {
      ctx.addIssue({
        code: "custom",
        message: "開始画像・終了画像は「画像から動画」「始点・終点」モードでのみ指定できます",
        path: ["firstFrameImageKey"],
      });
    }

    switch (body.mode) {
      case "image":
        if (body.endFrameImageKey) {
          ctx.addIssue({
            code: "custom",
            message: "終了画像を使う場合は「始点・終点」モードを選択してください",
            path: ["endFrameImageKey"],
          });
        }
        break;
      case "firstlast":
        if (!body.endFrameImageKey) {
          ctx.addIssue({
            code: "custom",
            message: "終了画像は必須です",
            path: ["endFrameImageKey"],
          });
        }
        break;
      case "text":
        if (referenceCount > 0) {
          ctx.addIssue({
            code: "custom",
            message: "テキストから動画を生成するモードでは素材を指定できません",
            path: ["referenceImageKeys"],
          });
        }
        if (!body.aspectRatio) {
          ctx.addIssue({ code: "custom", message: "アスペクト比は必須です", path: ["aspectRatio"] });
        }
        break;
      case "reference":
        if (referenceCount < 1) {
          ctx.addIssue({
            code: "custom",
            message: "参照素材を1件以上指定してください",
            path: ["referenceImageKeys"],
          });
        }
        if (referenceCount > h3.limits.maxTotalReferenceFiles) {
          ctx.addIssue({
            code: "custom",
            message: `参照素材は合計${h3.limits.maxTotalReferenceFiles}件までです`,
            path: ["referenceImageKeys"],
          });
        }
        if (!body.aspectRatio) {
          ctx.addIssue({ code: "custom", message: "アスペクト比は必須です", path: ["aspectRatio"] });
        }
        break;
    }
  });

/**
 * model を判別キーにした union。
 *
 * discriminatedUnion の判別キーには `.default()` を付けられないため、model 未指定の
 * リクエストは preprocess で先に補う。これはローリングデプロイ中に残る旧クライアント
 * (model を送らない版) の互換性のために必須。
 */
export const generateRequestSchema = z.preprocess((raw) => {
  if (raw === null || typeof raw !== "object") return raw;
  const body = raw as Record<string, unknown>;
  if (body.model === undefined || body.model === null) {
    return { ...body, model: LEGACY_VIDEO_MODEL };
  }
  return body;
}, z.discriminatedUnion("model", [seedanceSchema, minimaxSchema]));

export type GenerateRequest = z.infer<typeof generateRequestSchema>;
