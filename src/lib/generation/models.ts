// 動画生成モデルの定義を1箇所に集約する。
//
// UI(フォームの選択肢)・生成APIのバリデーション・課金・プロバイダ選択は、すべて
// ここを唯一の真実として参照する。モデル固有の制約をコンポーネントやAPIハンドラへ
// 直接ベタ書きしないこと。
//
// 注意: 新しいモデルを足す作業はこのファイルへ1エントリ足すだけでは終わらない。
// 実際にはプロバイダ実装・課金式・専用フォーム・zodスキーマ分岐も必要になる。
// このファイルが担うのは「モデルごとに異なる値」を散らばらせないことだけ。

import type { AspectRatio, GenerationMode } from "./options";
import { ASPECT_RATIOS, DEFAULT_DURATION_SECONDS } from "./options";

export const VIDEO_MODELS = ["seedance-2.5", "minimax-h3"] as const;
export type VideoModelId = (typeof VIDEO_MODELS)[number];

/** モデル未指定のリクエストを従来どおり扱うための既定値(後方互換用)。 */
export const LEGACY_VIDEO_MODEL: VideoModelId = "seedance-2.5";

/** 生成画面を開いたときに最初に選択されるモデル。 */
export const DEFAULT_VIDEO_MODEL: VideoModelId = "minimax-h3";

export const PROVIDER_NAMES = ["dreamina", "minimax"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export interface VideoModelMediaSpec {
  imageTypes: readonly string[];
  videoTypes: readonly string[];
  audioTypes: readonly string[];
  maxImageBytes: number;
  maxVideoBytes: number;
  maxAudioBytes: number;
  /** 参照動画・参照音声1本あたりの長さ制限(秒) */
  refClipMinSeconds: number;
  refClipMaxSeconds: number;
  /** 参照動画の合計・参照音声の合計それぞれの上限(秒) */
  refTotalMaxSeconds: number;
}

export interface VideoModelLimits {
  maxReferenceImages: number;
  maxReferenceVideos: number;
  maxReferenceAudios: number;
  /** 参照素材(画像+動画+音声)の合計ファイル数上限 */
  maxTotalReferenceFiles: number;
}

export interface VideoModelSpec {
  id: VideoModelId;
  label: string;
  provider: ProviderName;
  modes: readonly GenerationMode[];
  /** モデル固有のタブ文言。未指定のモードは GENERATION_MODE_LABELS を使う */
  modeLabels: Partial<Record<GenerationMode, string>>;
  defaultMode: GenerationMode;
  resolutions: readonly string[];
  defaultResolution: string;
  aspectRatios: readonly string[];
  durationMin: number;
  durationMax: number;
  defaultDuration: number;
  maxBatchSize: number;
  /** 音声生成のON/OFFをユーザーが選べるか(H3は常時ネイティブ音声のため false) */
  supportsAudioToggle: boolean;
  /** 全モードでプロンプト必須か(H3の公式仕様は非空テキスト1件必須) */
  requiresPrompt: boolean;
  maxPromptLength: number;
  /** プロンプト内で @image1 のようなメンションで参照素材を指すか */
  supportsMentions: boolean;
  limits: VideoModelLimits;
  media: VideoModelMediaSpec;
}

const SEEDANCE_MEDIA: VideoModelMediaSpec = {
  imageTypes: ["image/jpeg", "image/png", "image/webp", "image/bmp", "image/tiff", "image/gif"],
  videoTypes: ["video/mp4"],
  audioTypes: [],
  maxImageBytes: 30 * 1024 * 1024,
  maxVideoBytes: 200 * 1024 * 1024,
  maxAudioBytes: 0,
  refClipMinSeconds: 2,
  refClipMaxSeconds: 30,
  refTotalMaxSeconds: 30,
};

// MiniMax H3 公式リファレンス(platform.minimax.io/docs/api-reference/video-generation-v2-create)
// に記載された制約。画像 ≤30MB / 動画 ≤50MB / 音声 ≤15MB、参照クリップは各2〜15秒で合計15秒まで。
const MINIMAX_H3_MEDIA: VideoModelMediaSpec = {
  // HEIC/HEIF もAPI自体は受け付けるが、ブラウザでプレビューできないため今回は対象外。
  imageTypes: ["image/jpeg", "image/png", "image/webp"],
  videoTypes: ["video/mp4", "video/quicktime"],
  audioTypes: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"],
  maxImageBytes: 30 * 1024 * 1024,
  maxVideoBytes: 50 * 1024 * 1024,
  maxAudioBytes: 15 * 1024 * 1024,
  refClipMinSeconds: 2,
  refClipMaxSeconds: 15,
  refTotalMaxSeconds: 15,
};

const SPECS: Record<VideoModelId, VideoModelSpec> = {
  "seedance-2.5": {
    id: "seedance-2.5",
    label: "Seedance 2.5",
    provider: "dreamina",
    modes: ["reference", "image"],
    modeLabels: {},
    defaultMode: "reference",
    resolutions: ["480p", "720p", "1080p"],
    defaultResolution: "720p",
    aspectRatios: ASPECT_RATIOS,
    durationMin: 4,
    durationMax: 30,
    defaultDuration: DEFAULT_DURATION_SECONDS,
    maxBatchSize: 10,
    supportsAudioToggle: true,
    // image モードはプロンプト任意(公式に "Text (optional) + image")
    requiresPrompt: false,
    maxPromptLength: 5000,
    supportsMentions: true,
    limits: {
      maxReferenceImages: 9,
      maxReferenceVideos: 3,
      maxReferenceAudios: 0,
      maxTotalReferenceFiles: 12,
    },
    media: SEEDANCE_MEDIA,
  },
  "minimax-h3": {
    id: "minimax-h3",
    label: "MiniMax H3",
    provider: "minimax",
    modes: ["image", "text", "firstlast", "reference"],
    modeLabels: {
      image: "画像から動画",
      text: "テキスト",
      firstlast: "始点・終点",
      reference: "参照素材",
    },
    defaultMode: "image",
    // 768P はクローズドβという第三者情報があるが公式の料金表・APIリファレンスにβ表記は無い。
    // 実運用で 400 が返る場合は defaultResolution を "2K" に変えるだけで既定を切り替えられる。
    resolutions: ["768P", "2K"],
    defaultResolution: "768P",
    // H3 自体は 21:9 / 3:4 も対応するが、スタッフ単位の許可リスト(allowedAspectRatios)が
    // 既存4種しか持たず、旧管理画面から保存されると追加値が消えるため今回は増やさない。
    aspectRatios: ASPECT_RATIOS,
    durationMin: 4,
    durationMax: 15,
    defaultDuration: DEFAULT_DURATION_SECONDS,
    // 2K/15秒は1本あたり約$1.95。誤操作での高額生成を避けるため一括生成は許可しない。
    maxBatchSize: 1,
    supportsAudioToggle: false,
    // 公式リファレンス: "Every request must include one non-empty text item"
    requiresPrompt: true,
    maxPromptLength: 7000,
    // H3 の参照は content[] の並び順で行われ、メンションタグの仕様は公式に存在しない。
    supportsMentions: false,
    limits: {
      maxReferenceImages: 9,
      maxReferenceVideos: 3,
      maxReferenceAudios: 3,
      maxTotalReferenceFiles: 12,
    },
    media: MINIMAX_H3_MEDIA,
  },
};

export function isVideoModelId(value: unknown): value is VideoModelId {
  return typeof value === "string" && (VIDEO_MODELS as readonly string[]).includes(value);
}

export function getModelSpec(id: VideoModelId): VideoModelSpec {
  return SPECS[id];
}

export function providerOf(id: VideoModelId): ProviderName {
  return SPECS[id].provider;
}

/** モデルのタブ文言。モデル固有のラベルが無ければ共通ラベルへフォールバックする。 */
export function modeLabel(
  spec: VideoModelSpec,
  mode: GenerationMode,
  fallback: Record<GenerationMode, string>
): string {
  return spec.modeLabels[mode] ?? fallback[mode];
}

/** モデルが対応するアスペクト比と、スタッフごとの許可リストの交差を返す。 */
export function allowedAspectRatiosFor(
  spec: VideoModelSpec,
  allowed: readonly string[] | undefined
): AspectRatio[] {
  return ASPECT_RATIOS.filter(
    (a) => spec.aspectRatios.includes(a) && (allowed?.includes(a) ?? true)
  );
}
