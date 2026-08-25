import { ADAPTIVE_ASPECT_RATIO } from "./options";

/**
 * ジョブに保存されたアスペクト比を CSS の `aspect-ratio` 値へ変換する。
 *
 * 生成結果の表示枠を 16:9 に固定すると、9:16 などの縦動画が枠に合わせて
 * 切り取られ「指定した比率で生成されなかった」ように見える。実際にプロバイダが
 * 採用した比率はジョブに残っているので、それを表示枠へそのまま反映する。
 *
 * image / firstlast モードでは比率が入力画像に追従するため "adaptive" が保存され、
 * 再生するまで実際の比率は分からない。その場合は undefined を返して呼び出し側の
 * 既定枠へフォールバックさせる。動画は object-contain で描画するため、枠と実比率が
 * ずれても切り取られることはない。
 */
export function cssAspectRatio(value: string | null | undefined): string | undefined {
  if (!value || value === ADAPTIVE_ASPECT_RATIO) return undefined;
  const matched = /^(\d+):(\d+)$/.exec(value);
  if (!matched) return undefined;
  const [, width, height] = matched;
  if (Number(width) <= 0 || Number(height) <= 0) return undefined;
  return `${width} / ${height}`;
}
