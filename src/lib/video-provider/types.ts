import type { GenerationMode } from "@/lib/generation/options";
import type { VideoModelId } from "@/lib/generation/models";

export interface ReferenceImage {
  /** プロンプト内で参照する際のタグ (例: "@image1") */
  tag: string;
  url: string;
}

export interface ReferenceVideo {
  /** プロンプト内で参照する際のタグ (例: "@video1") */
  tag: string;
  url: string;
}

export interface ReferenceAudio {
  /** UI上の表示番号に対応するタグ (例: "@audio1")。並び順がAPIの参照順になる */
  tag: string;
  url: string;
}

export interface VideoGenerationRequest {
  model: VideoModelId;
  /** 生成モード。フィールドの有無から推測せず、呼び出し側が明示する */
  mode: GenerationMode;
  prompt: string;
  referenceImages: ReferenceImage[];
  referenceVideos: ReferenceVideo[];
  referenceAudios: ReferenceAudio[];
  /** image to video の先頭フレーム画像。指定時は referenceImages/referenceVideos と併用不可 */
  firstFrameImageUrl?: string;
  /** image to video の末尾フレーム画像 */
  endFrameImageUrl?: string;
  resolution: string;
  durationSeconds: number;
  aspectRatio: string;
  generateAudio: boolean;
}

export interface VideoGenerationSubmitResult {
  providerJobId: string;
}

export type ProviderJobStatus = "pending" | "processing" | "completed" | "failed";

/**
 * プロバイダが報告した使用量。課金単位がモデルごとに違うため、両方の形を持つ。
 * - Seedance 2.5: トークン課金
 * - MiniMax H3: 出力秒 + 入力動画秒 + 入力画像枚数
 */
export interface ProviderUsage {
  totalTokens?: number;
  completionTokens?: number;
  outputSeconds?: number;
  inputSeconds?: number;
  inputImageCount?: number;
  inputAudioSeconds?: number;
}

export interface VideoGenerationStatusResult {
  status: ProviderJobStatus;
  progress?: number;
  videoUrl?: string;
  thumbnailUrl?: string;
  /** ユーザーに表示する日本語メッセージ。プロバイダの生文言をそのまま出さない */
  errorMessage?: string;
  /** プロバイダのエラーコード（開発者向け） */
  errorCode?: string;
  usage?: ProviderUsage;
}

/** ログに残す開発者向けの詳細。APIキー・presigned URL・プロンプト本文は入れないこと。 */
export interface ProviderErrorDetail {
  provider: string;
  model?: string;
  taskId?: string;
  httpStatus?: number;
  errorCode?: string;
  providerMessage?: string;
  requestId?: string;
}

/**
 * 一時的な失敗（429 / 5xx / ネットワーク / タイムアウト）。
 *
 * ポーラーは getStatus の例外を握って次tickに回すため、再試行すべき失敗は
 * "failed" を返すのではなく必ず throw する。返してしまうとジョブが失敗確定し、
 * まだ生成中のタスクにクレジットが返還されてしまう。
 */
export class RetryableProviderError extends Error {
  constructor(
    message: string,
    readonly detail: ProviderErrorDetail
  ) {
    super(message);
    this.name = "RetryableProviderError";
  }
}

/** 確定的な失敗（400/401/402/422 など）。ジョブを失敗として確定させてよい。 */
export class TerminalProviderError extends Error {
  /** ユーザーに表示する日本語メッセージ */
  readonly userMessage: string;

  constructor(userMessage: string, readonly detail: ProviderErrorDetail) {
    super(userMessage);
    this.name = "TerminalProviderError";
    this.userMessage = userMessage;
  }
}

export interface VideoGenerationProvider {
  readonly name: string;
  submit(req: VideoGenerationRequest): Promise<VideoGenerationSubmitResult>;
  getStatus(providerJobId: string): Promise<VideoGenerationStatusResult>;
}
