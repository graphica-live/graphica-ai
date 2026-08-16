/**
 * プロンプト内の参照画像メンション(`@image1`など)に関するロジック。
 * タグはアップロード済み参照画像の表示順インデックスから導出する
 * (1番目の画像が `@image1`)。DB/APIには画像順序のみを保持し、
 * タグ自体は永続化しない。
 */

export function referenceImageTag(index: number): string {
  return `@image${index + 1}`;
}

export interface MentionQuery {
  /** プロンプト文字列中、`@` の開始位置 */
  start: number;
  /** `@` の直後からカーソル位置までの文字列(絞り込み用) */
  query: string;
}

/**
 * カーソル位置(caretIndex)から遡って、直前に入力中のメンション(`@xxx`)があれば返す。
 * `@` の直前が空白/改行/先頭でない場合はメンション扱いしない。
 */
export function findMentionQuery(value: string, caretIndex: number): MentionQuery | null {
  let start = -1;
  for (let i = caretIndex - 1; i >= 0; i--) {
    const ch = value[i];
    if (ch === "@") {
      start = i;
      break;
    }
    if (/\s/.test(ch)) return null;
  }
  if (start === -1) return null;
  if (start > 0 && !/\s/.test(value[start - 1])) return null;

  return { start, query: value.slice(start + 1, caretIndex) };
}

export function applyMention(
  value: string,
  mention: MentionQuery,
  caretIndex: number,
  tag: string
): { value: string; caretIndex: number } {
  const before = value.slice(0, mention.start);
  const after = value.slice(caretIndex);
  const inserted = `${tag} `;
  return {
    value: `${before}${inserted}${after}`,
    caretIndex: before.length + inserted.length,
  };
}
