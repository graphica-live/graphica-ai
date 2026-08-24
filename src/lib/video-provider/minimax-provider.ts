import type {
  ProviderJobStatus,
  ProviderUsage,
  VideoGenerationProvider,
  VideoGenerationRequest,
  VideoGenerationStatusResult,
} from "./types";
import { RetryableProviderError, TerminalProviderError } from "./types";
import { logProviderError } from "./provider-log";

/**
 * MiniMax H3 (Hailuo 3.0) の Video Generation V2 API 実装。
 *
 * 公式リファレンス:
 *   POST https://api.minimax.io/v2/video_generation
 *   GET  https://api.minimax.io/v2/query/video_generation/{task_id}
 *
 * - resolution / duration / ratio はトップレベルのJSONパラメータ。入力素材は content[] に
 *   type(text/image_url/video_url/audio_url) と role で並べる。参照は content[] の並び順で
 *   行われ、Seedance のような @mention タグの仕様は公式に存在しない。
 * - image-to-video(first/last frame)と reference-to-video は公式に "mutually exclusive"。
 *   呼び出し側(zod)で検証済みの前提で、mode に応じて片方だけを組み立てる。
 * - 全モードで「非空のtext 1件」が必須（"Every request must include one non-empty text item"）。
 * - first_frame 指定時はアスペクト比が入力画像に追従し ratio は adaptive 固定。
 *   text-to-video では adaptive を指定できない。
 * - generate_audio は送らない。H3 は常にネイティブ音声を生成する。
 */

const DEFAULT_BASE_URL = "https://api.minimax.io";
export const MINIMAX_H3_MODEL = "MiniMax-H3";

const SUBMIT_TIMEOUT_MS = 30_000;
const STATUS_TIMEOUT_MS = 15_000;

type MiniMaxContentItem =
  | { type: "text"; text: string }
  | {
      type: "image_url";
      image_url: { url: string };
      role: "first_frame" | "last_frame" | "reference_image";
    }
  | { type: "video_url"; video_url: { url: string }; role: "reference_video" }
  | { type: "audio_url"; audio_url: { url: string }; role: "reference_audio" };

export interface MiniMaxSubmitBody {
  model: string;
  content: MiniMaxContentItem[];
  resolution: string;
  duration: number;
  ratio: string;
}

interface MiniMaxTask {
  id?: string;
  model?: string;
  status?: string;
  content?: { url?: string };
  resolution?: string;
  duration?: number;
  ratio?: string;
  usage?: {
    total_seconds?: number;
    input_seconds?: number;
    output_seconds?: number;
    input_image_count?: number;
    input_audio_seconds?: number;
  };
  error?: { code?: string; message?: string };
}

const ADAPTIVE = "adaptive";

/**
 * リクエストボディを組み立てる。純関数なのでテストから直接検証できる。
 */
export function buildMiniMaxRequestBody(req: VideoGenerationRequest): MiniMaxSubmitBody {
  const content: MiniMaxContentItem[] = [{ type: "text", text: req.prompt }];

  switch (req.mode) {
    case "image":
      if (req.firstFrameImageUrl) {
        content.push({
          type: "image_url",
          image_url: { url: req.firstFrameImageUrl },
          role: "first_frame",
        });
      }
      break;
    case "firstlast":
      if (req.firstFrameImageUrl) {
        content.push({
          type: "image_url",
          image_url: { url: req.firstFrameImageUrl },
          role: "first_frame",
        });
      }
      if (req.endFrameImageUrl) {
        content.push({
          type: "image_url",
          image_url: { url: req.endFrameImageUrl },
          role: "last_frame",
        });
      }
      break;
    case "reference":
      for (const image of req.referenceImages) {
        content.push({
          type: "image_url",
          image_url: { url: image.url },
          role: "reference_image",
        });
      }
      for (const video of req.referenceVideos) {
        content.push({ type: "video_url", video_url: { url: video.url }, role: "reference_video" });
      }
      for (const audio of req.referenceAudios) {
        content.push({ type: "audio_url", audio_url: { url: audio.url }, role: "reference_audio" });
      }
      break;
    case "text":
      // テキストのみ。追加の content は無い。
      break;
  }

  // 先頭フレームを与えるモードではアスペクト比が入力画像に追従するため adaptive 固定。
  const usesFrames = req.mode === "image" || req.mode === "firstlast";

  return {
    model: MINIMAX_H3_MODEL,
    content,
    resolution: req.resolution,
    duration: req.durationSeconds,
    ratio: usesFrames ? ADAPTIVE : req.aspectRatio,
  };
}

export function mapMiniMaxStatus(status: string | undefined): ProviderJobStatus {
  switch (status) {
    case "queued":
      return "pending";
    case "running":
      return "processing";
    case "succeeded":
      return "completed";
    case "failed":
    case "cancelled":
      return "failed";
    default:
      // 未知のステータスを失敗扱いにすると生成中のジョブを取り消してしまうため、
      // 処理中とみなして次tickで再確認する。
      return "processing";
  }
}

const USER_MESSAGE_BY_STATUS: Record<number, string> = {
  400: "入力内容が不正です。素材やプロンプトを確認してください。",
  401: "動画生成APIの認証に失敗しました。管理者に連絡してください。",
  402: "動画生成APIの残高が不足しています。管理者に連絡してください。",
  403: "動画生成APIの利用が拒否されました。管理者に連絡してください。",
  404: "生成タスクが見つかりませんでした。",
  422: "プロンプトまたは素材が利用規約に抵触した可能性があります。内容を見直してください。",
};

/**
 * HTTPステータスから Terminal / Retryable を判定して例外を作る。
 *
 * 429 と 5xx とネットワーク障害は Retryable。これらを失敗確定にすると、
 * まだ生成中のタスクを取り消してユーザーに誤った失敗を見せてしまう。
 */
export function classifyMiniMaxHttpError(
  httpStatus: number,
  detail: { taskId?: string; errorCode?: string; providerMessage?: string; requestId?: string }
): RetryableProviderError | TerminalProviderError {
  const base = { provider: "minimax", model: MINIMAX_H3_MODEL, ...detail, httpStatus };
  if (httpStatus === 429 || httpStatus >= 500) {
    return new RetryableProviderError(`MiniMax API transient failure (status=${httpStatus})`, base);
  }
  const userMessage =
    USER_MESSAGE_BY_STATUS[httpStatus] ??
    "生成に失敗しました。入力素材またはプロンプトを確認してください。";
  return new TerminalProviderError(userMessage, base);
}

function authHeaders(): Record<string, string> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error("MINIMAX_API_KEYが設定されていません");
  }
  return { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
}

function baseUrl(): string {
  return (process.env.MINIMAX_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

async function requestJson(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<{ res: Response; body: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const parsed: unknown = await res.json().catch(() => ({}));
    const body =
      parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    return { res, body };
  } catch (err) {
    // ネットワーク障害・タイムアウトは再試行可能として扱う
    throw new RetryableProviderError(
      err instanceof Error && err.name === "AbortError"
        ? `MiniMax API timeout after ${timeoutMs}ms`
        : `MiniMax API network failure: ${err instanceof Error ? err.name : "unknown"}`,
      { provider: "minimax", model: MINIMAX_H3_MODEL }
    );
  } finally {
    clearTimeout(timer);
  }
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** レスポンスからエラー情報を取り出す。形は実行時に検証し、型を無条件に信用しない。 */
function readErrorInfo(body: Record<string, unknown>): {
  errorCode?: string;
  providerMessage?: string;
  requestId?: string;
} {
  const requestId = readString(body, "request_id");
  const raw = body.error;
  if (raw === null || typeof raw !== "object") {
    return { requestId, providerMessage: readString(body, "message") };
  }
  const error = raw as Record<string, unknown>;
  const code = error.code;
  return {
    errorCode: typeof code === "string" ? code : typeof code === "number" ? String(code) : undefined,
    providerMessage: readString(error, "message"),
    requestId,
  };
}

function readTask(body: Record<string, unknown>): MiniMaxTask | null {
  const raw = body.task;
  if (raw === null || typeof raw !== "object") return null;
  return raw as MiniMaxTask;
}

function toProviderUsage(task: MiniMaxTask): ProviderUsage | undefined {
  const usage = task.usage;
  if (!usage) return undefined;
  const normalized: ProviderUsage = {
    outputSeconds: usage.output_seconds,
    inputSeconds: usage.input_seconds,
    inputImageCount: usage.input_image_count,
    inputAudioSeconds: usage.input_audio_seconds,
  };
  const hasAny = Object.values(normalized).some((v) => typeof v === "number");
  return hasAny ? normalized : undefined;
}

export const minimaxProvider: VideoGenerationProvider = {
  name: "minimax",

  async submit(req) {
    const { res, body } = await requestJson(
      `${baseUrl()}/v2/video_generation`,
      {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(buildMiniMaxRequestBody(req)),
      },
      SUBMIT_TIMEOUT_MS
    );

    const info = readErrorInfo(body);
    if (!res.ok) {
      const err = classifyMiniMaxHttpError(res.status, info);
      logProviderError("submit", err.detail);
      throw err;
    }

    const taskId = readString(body, "task_id");
    if (!taskId) {
      // 200なのにtask_idが無い＝受理されたかどうか判断できない。再試行すると
      // 二重生成の危険があるため確定的な失敗として扱い、ログで区別できるようにする。
      const detail = { provider: "minimax", model: MINIMAX_H3_MODEL, httpStatus: res.status, ...info };
      logProviderError("submission-unknown", detail);
      throw new TerminalProviderError(
        "生成の開始に失敗しました。時間をおいて再試行してください。",
        detail
      );
    }
    return { providerJobId: taskId };
  },

  async getStatus(providerJobId): Promise<VideoGenerationStatusResult> {
    const { res, body } = await requestJson(
      `${baseUrl()}/v2/query/video_generation/${encodeURIComponent(providerJobId)}`,
      { headers: authHeaders() },
      STATUS_TIMEOUT_MS
    );

    const info = readErrorInfo(body);
    if (!res.ok) {
      const err = classifyMiniMaxHttpError(res.status, { ...info, taskId: providerJobId });
      logProviderError("status", err.detail);
      throw err;
    }

    const task = readTask(body);
    if (!task) {
      // 200だが期待した形でない。恒久的な不整合か一時的な異常か区別できないので、
      // 再試行可能として次tickへ回す（stuck sweepが最終的に拾う）。
      throw new RetryableProviderError("MiniMax API returned an unexpected payload", {
        provider: "minimax",
        model: MINIMAX_H3_MODEL,
        taskId: providerJobId,
        requestId: info.requestId,
      });
    }

    const status = mapMiniMaxStatus(task.status);
    if (status === "failed") {
      const detail = {
        provider: "minimax",
        model: MINIMAX_H3_MODEL,
        taskId: providerJobId,
        errorCode: task.error?.code,
        providerMessage: task.error?.message,
        requestId: info.requestId,
      };
      logProviderError("status", detail);
      return {
        status,
        errorCode: task.error?.code,
        errorMessage: "生成に失敗しました。入力素材またはプロンプトを確認してください。",
      };
    }
    if (status === "completed") {
      return {
        status,
        videoUrl: task.content?.url,
        usage: toProviderUsage(task),
      };
    }
    return { status };
  },
};
