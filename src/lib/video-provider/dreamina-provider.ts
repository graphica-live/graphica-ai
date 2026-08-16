import type { VideoGenerationRequest, VideoGenerationProvider } from "./types";

interface DreaminaReferenceImage {
  tag: string;
  url: string;
}

interface DreaminaGenerateRequestBody {
  prompt: string;
  resolution: string;
  duration: number;
  aspect_ratio: string;
  reference_images?: DreaminaReferenceImage[];
  end_frame_image_url?: string;
}

/**
 * プロンプト中の `@image1` などのタグと参照画像URLを、Seedance/Dreamina API仕様の
 * `reference_images` 配列にマッピングしたリクエストボディを組み立てる。
 * プロンプト文字列自体はタグを含んだまま送る(API側でタグを解決する仕様のため)。
 */
export function buildDreaminaRequestBody(req: VideoGenerationRequest): DreaminaGenerateRequestBody {
  return {
    prompt: req.prompt,
    resolution: req.resolution,
    duration: req.durationSeconds,
    aspect_ratio: req.aspectRatio,
    ...(req.referenceImages.length > 0 && {
      reference_images: req.referenceImages.map(({ tag, url }) => ({ tag, url })),
    }),
    ...(req.endFrameImageUrl && { end_frame_image_url: req.endFrameImageUrl }),
  };
}

// Dreamina APIの実仕様(認証方式・エンドポイント・レスポンス形式)が確定していないため、
// HTTP送信部分は未実装。仕様確定後、buildDreaminaRequestBody()の結果をPOSTする形で
// submit/getStatusを実装する。
export const dreaminaProvider: VideoGenerationProvider = {
  name: "dreamina",

  async submit() {
    throw new Error(
      "Dreamina providerは未実装です。仕様確定後にsrc/lib/video-provider/dreamina-provider.tsを実装してください。"
    );
  },

  async getStatus() {
    throw new Error(
      "Dreamina providerは未実装です。仕様確定後にsrc/lib/video-provider/dreamina-provider.tsを実装してください。"
    );
  },
};
