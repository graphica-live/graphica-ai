/**
 * プロバイダ(BytePlus ModelArk / Seedance)が返す英語のエラーメッセージを、
 * 利用者が読んで次の行動を判断できる日本語へ変換する。
 *
 * プロバイダのメッセージはそのままDBの `providerError` に保存し(調査用に原文を残す)、
 * 画面表示の直前にこの関数を通す。既知のパターンに当てはまらない場合は、
 * 原文を落とさずに日本語の前置きを付けて表示する。
 */

interface ProviderErrorRule {
  match: RegExp;
  message: string;
}

/** 上から順に評価する。より具体的な条件を先に置くこと。 */
const RULES: ProviderErrorRule[] = [
  {
    // 例: "The request failed because the output audio may be related to
    //      copyright restrictions. Request id: 02178707623223..."
    match: /output audio[\s\S]*copyright/i,
    message:
      "生成された音声が著作権保護の対象と判断されたため、動画を生成できませんでした。音声生成をオフにするか、プロンプトから曲名・アーティスト名など既存の楽曲を想起させる表現を外して再度お試しください。",
  },
  {
    match: /copyright/i,
    message:
      "生成内容が著作権保護の対象と判断されたため、動画を生成できませんでした。プロンプトや参照素材から特定の作品・キャラクター・楽曲を想起させる表現を外して再度お試しください。",
  },
  {
    match: /sensitive|content policy|risk control|moderation/i,
    message:
      "プロンプトまたは参照素材がコンテンツポリシーに抵触すると判断されたため、動画を生成できませんでした。表現や素材を見直して再度お試しください。",
  },
  {
    match: /rate limit|too many requests|quota/i,
    message:
      "プロバイダ側の混雑または利用上限に達したため、動画を生成できませんでした。しばらく時間をおいて再度お試しください。",
  },
  {
    match: /internal (service )?error|service unavailable|timed? ?out/i,
    message:
      "プロバイダ側で一時的なエラーが発生したため、動画を生成できませんでした。しばらく時間をおいて再度お試しください。",
  },
];

const GENERIC_MESSAGE = "生成に失敗しました";

/** 利用者には意味を持たない追跡用IDを落とす */
function stripRequestId(text: string): string {
  return text.replace(/\s*Request id:\s*\S+/gi, "").trim();
}

export function toUserFacingProviderError(raw?: string | null): string {
  const text = raw?.trim();
  if (!text) return GENERIC_MESSAGE;

  const rule = RULES.find((r) => r.match.test(text));
  if (rule) return rule.message;

  // アプリ側で生成した日本語メッセージ(タイムアウト時など)はそのまま表示する
  if (/[ぁ-んァ-ヶ一-龠]/.test(text)) return text;

  return `${GENERIC_MESSAGE}（詳細: ${stripRequestId(text)}）`;
}
