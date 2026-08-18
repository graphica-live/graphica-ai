import type {
  VideoGenerationRequest,
  VideoGenerationProvider,
  VideoGenerationStatusResult,
  ProviderJobStatus,
} from "./types";

const BASE_URL = process.env.DREAMINA_API_BASE_URL || "https://ark.ap-southeast.bytepluses.com/api/v3";
// BytePlus ModelArkのSeedance 2.5モデルID。Web検索で確認した最有力候補で未確認。
// 初回submit時に404/ModelNotFound系のエラーが返る場合はこの値を見直すこと。
const MODEL = "dreamina-seedance-2-5-260628";

type ContentItem =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string }; role: string };

interface DreaminaSubmitBody {
  model: string;
  content: ContentItem[];
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
 * プロンプト末尾に `--ratio --resolution --duration --camerafixed` を埋め込む形式。
 * BytePlus公式ブログのcurl例(Seedance 1.0/lite)で確認済みの形式をそのまま踏襲する。
 * 参照画像・末尾フレームのcontent要素(role名含む)はドキュメントが未確認のためベストエフォート。
 */
export function buildDreaminaRequestBody(req: VideoGenerationRequest): DreaminaSubmitBody {
  const text = `${req.prompt} --ratio ${req.aspectRatio} --resolution ${req.resolution} --duration ${req.durationSeconds} --camerafixed false`;
  const content: ContentItem[] = [{ type: "text", text }];

  for (const image of req.referenceImages) {
    content.push({ type: "image_url", image_url: { url: image.url }, role: "reference_image" });
  }
  if (req.endFrameImageUrl) {
    content.push({ type: "image_url", image_url: { url: req.endFrameImageUrl }, role: "last_frame" });
  }

  return { model: MODEL, content };
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
