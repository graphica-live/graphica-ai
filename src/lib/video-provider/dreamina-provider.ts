import type { VideoGenerationProvider } from "./types";

// Dreamina APIの実仕様(認証方式・エンドポイント・リクエスト/レスポンス形式)が
// 確定していないため未実装。仕様確定後にsubmit/getStatusを実装する。
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
