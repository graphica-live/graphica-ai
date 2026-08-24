import type { VideoGenerationProvider } from "./types";
import type { ProviderName } from "@/lib/generation/models";
import { PROVIDER_NAMES } from "@/lib/generation/models";
import { createMockProvider } from "./mock-provider";
import { dreaminaProvider } from "./dreamina-provider";
import { minimaxProvider } from "./minimax-provider";

/**
 * このコンテナが処理できるプロバイダ。
 *
 * ポーラーはこの集合でジョブを絞る。将来プロバイダを追加したリリースへ切り替える最中、
 * 旧コンテナが「自分の知らないプロバイダのジョブ」を別APIへ問い合わせて失敗・返金して
 * しまう事故を防ぐための境界でもある（src/lib/jobs/poller.ts）。
 */
export const SUPPORTED_PROVIDERS = PROVIDER_NAMES;

export function isProviderName(value: string): value is ProviderName {
  return (PROVIDER_NAMES as readonly string[]).includes(value);
}

const isProduction = () => process.env.NODE_ENV === "production";

/**
 * MiniMax H3 が利用可能か。
 *
 * 本番でキーが無いときにmockへフォールバックすると、設定漏れが「正常終了した
 * サンプル動画」に化けて検知できない。本番ではmockに落とさず利用不可にする。
 *
 * この判定はローリングデプロイの安全弁も兼ねている。コードを先に全コンテナへ行き渡らせ、
 * その後で MINIMAX_API_KEY を設定するまでH3ジョブが1件も作られないため、
 * プロバイダを知らない旧コンテナがH3ジョブに遭遇することが起こらない。
 * 詳細は README の「MiniMax H3 の有効化手順」を参照。
 */
export function isMiniMaxAvailable(): boolean {
  if (process.env.MINIMAX_API_KEY) return true;
  return process.env.MINIMAX_MOCK_MODE === "1" && !isProduction();
}

// `use` で始まる名前はReact Hookと誤判定され react-hooks/rules-of-hooks でビルドが落ちるため、
// `shouldUse` を接頭辞にしている。
function shouldUseMiniMaxMock(): boolean {
  return process.env.MINIMAX_MOCK_MODE === "1" && !isProduction();
}

// Dreamina側の判定は既存挙動を変えない（本番でキーが無ければmockになる点も含めて据え置き）。
function shouldUseDreaminaMock(): boolean {
  return process.env.DREAMINA_MOCK_MODE === "1" || !process.env.DREAMINA_API_KEY;
}

export function getVideoProvider(name: ProviderName): VideoGenerationProvider {
  switch (name) {
    case "minimax":
      return shouldUseMiniMaxMock() ? createMockProvider("minimax") : minimaxProvider;
    case "dreamina":
    default:
      return shouldUseDreaminaMock() ? createMockProvider("dreamina") : dreaminaProvider;
  }
}

export * from "./types";
