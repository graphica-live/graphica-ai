import type {
  VideoGenerationRequest,
  VideoGenerationProvider,
  VideoGenerationStatusResult,
  ProviderJobStatus,
} from "./types";
import { normalizeMentionsForDreamina } from "@/lib/generation/mention";

const BASE_URL = process.env.DREAMINA_API_BASE_URL || "https://ark.ap-southeast.bytepluses.com/api/v3";
// BytePlus ModelArkのSeedance 2.5モデルID。Web検索で確認した最有力候補で未確認。
// 初回submit時に404/ModelNotFound系のエラーが返る場合はこの値を見直すこと。
const MODEL = "dreamina-seedance-2-5-260628";

type ContentItem =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string }; role: "reference_image" | "last_frame" }
  | { type: "video_url"; video_url: { url: string }; role: "reference_video" };

interface DreaminaSubmitBody {
  model: string;
  content: ContentItem[];
  resolution: string;
  ratio: string;
  duration: number;
  generate_audio: boolean;
  omni_reference_task_type?: "reference";
}

interface DreaminaErrorResponse {
  error?: { code?: string; message?: string; param?: string; type?: string };
}

interface DreaminaTaskResponse extends DreaminaErrorResponse {
  id?: string;
  model?: string;
  status?: string;
  content?: { video_url?: string };
  usage?: { completion_tokens?: number; total_tokens?: number };
}

/**
 * BytePlus ModelArk公式APIリファレンス「Create a video generation task」
 * (docs.byteplus.com/en/docs/ModelArk/1520757, Seedance 2.5)に基づく実装。
 *
 * - resolution/ratio/duration はトップレベルのJSONパラメータとして送る
 *   (プロンプト文字列への `--flag` 埋め込みは公式リファレンスに存在しない)。
 * - camera_fixed はSupported modelsにSeedance 2.5が含まれないため送信しない。
 * - endFrameImageUrl(first/last-frame)使用時、Seedance 2.5は先頭フレームの
 *   アスペクト比を自動維持し ratio は `adaptive` 固定のみサポートされる。
 * - referenceVideos(omni reference-to-video)使用時は `omni_reference_task_type:
 *   "reference"` を明示する。省略(=auto)だとプロンプト文言次第でedit/extendに
 *   誤判定され `InvalidParameter.TaskTypeMismatch` になりうるため常に明示する。
 * - endFrameImageUrl と referenceVideos/referenceImages(reference_video/
 *   reference_image role)は公式に "mutually exclusive" と明記されており併用不可
 *   (呼び出し側でバリデーション済みの前提)。
 * - generate_audio はトップレベルのJSONブール値として送る。省略時のAPI既定値が
 *   trueかは公式リファレンスで明示されていないため、常に明示的に送信する。
 */
export function buildDreaminaRequestBody(req: VideoGenerationRequest): DreaminaSubmitBody {
  const text = normalizeMentionsForDreamina(req.prompt);
  const content: ContentItem[] = [{ type: "text", text }];

  for (const image of req.referenceImages) {
    content.push({ type: "image_url", image_url: { url: image.url }, role: "reference_image" });
  }
  if (req.endFrameImageUrl) {
    content.push({ type: "image_url", image_url: { url: req.endFrameImageUrl }, role: "last_frame" });
  }
  for (const video of req.referenceVideos) {
    content.push({ type: "video_url", video_url: { url: video.url }, role: "reference_video" });
  }

  return {
    model: MODEL,
    content,
    resolution: req.resolution,
    ratio: req.endFrameImageUrl ? "adaptive" : req.aspectRatio,
    duration: req.durationSeconds,
    generate_audio: req.generateAudio,
    ...(req.referenceVideos.length > 0 ? { omni_reference_task_type: "reference" as const } : {}),
  };
}

function mapProviderStatus(status: string | undefined): ProviderJobStatus {
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
      return "processing";
  }
}

function authHeaders(): Record<string, string> {
  const apiKey = process.env.DREAMINA_API_KEY;
  if (!apiKey) {
    throw new Error("DREAMINA_API_KEYが設定されていません");
  }
  return { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
}

export const dreaminaProvider: VideoGenerationProvider = {
  name: "dreamina",

  async submit(req) {
    const res = await fetch(`${BASE_URL}/contents/generations/tasks`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(buildDreaminaRequestBody(req)),
    });
    const body: DreaminaTaskResponse = await res.json().catch(() => ({}));
    if (!res.ok || !body.id) {
      throw new Error(body.error?.message ?? `Dreamina submit failed: status=${res.status}`);
    }
    return { providerJobId: body.id };
  },

  async getStatus(providerJobId): Promise<VideoGenerationStatusResult> {
    const res = await fetch(`${BASE_URL}/contents/generations/tasks/${providerJobId}`, {
      headers: authHeaders(),
    });
    const body: DreaminaTaskResponse = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error?.message ?? `Dreamina getStatus failed: status=${res.status}`);
    }

    const status = mapProviderStatus(body.status);
    if (status === "failed") {
      return {
        status,
        errorMessage: body.error?.message ?? `生成に失敗しました(Dreamina, status=${body.status})`,
      };
    }
    if (status === "completed") {
      return {
        status,
        videoUrl: body.content?.video_url,
        usage:
          body.usage?.total_tokens != null
            ? {
                completionTokens: body.usage.completion_tokens ?? body.usage.total_tokens,
                totalTokens: body.usage.total_tokens,
              }
            : undefined,
      };
    }
    return { status };
  },
};
