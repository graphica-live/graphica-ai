import type { ProviderErrorDetail } from "./types";

/**
 * プロバイダのエラーを開発者向けに1行で記録する。
 *
 * ユーザーに見せる文言とは分離し、こちらには追跡に必要な識別子だけを残す。
 * APIキー・presigned URL・プロンプト本文は ProviderErrorDetail に入れないこと
 * （URLには署名が、プロンプトには業務内容が含まれるため）。
 */
export function logProviderError(
  kind: "submit" | "status" | "submission-unknown",
  detail: ProviderErrorDetail
) {
  console.error(
    `[video-provider] ${kind} failed ${JSON.stringify({
      provider: detail.provider,
      model: detail.model,
      taskId: detail.taskId,
      httpStatus: detail.httpStatus,
      errorCode: detail.errorCode,
      providerMessage: detail.providerMessage,
      requestId: detail.requestId,
    })}`
  );
}
