/**
 * プロンプト内の参照画像メンション(`@image1`など)に関するロジック。
 * タグはアップロード済み参照画像の表示順インデックスから導出する
 * (1番目の画像が `@image1`)。DB/APIには画像順序のみを保持し、
 * タグ自体は永続化しない。
 */

export function referenceImageTag(index: number): string {
  return `@image${index + 1}`;
}

export function referenceVideoTag(index: number): string {
  return `@video${index + 1}`;
}

/**
 * Dreamina(Seedance 2.5)送信直前にのみ適用する表記正規化。
 * UI内部/DBでは `@image1` `@video1` (小文字)のまま保持し、
 * 実際にPOSTされる公式curl例で使われている `@Image1` `@Video1` (先頭大文字)に変換する。
 */
export function normalizeMentionsForDreamina(prompt: string): string {
  return prompt.replace(/@image(\d+)/g, "@Image$1").replace(/@video(\d+)/g, "@Video$1");
}

export interface MentionQuery {
  /** プロンプト文字列中、`@` の開始位置 */
  start: number;
  /** `@` の直後からカーソル位置までの文字列(絞り込み用) */
  query: string;
}

/**
 * カーソル位置(caretIndex)から遡って、直前に入力中のメンション(`@xxx`)があれば返す。
 * `@` の直後からカーソルまでに空白/改行が挟まれば入力中のメンションとはみなさない。
 * 日本語プロンプトでは単語間にスペースを置かないのが通例のため、`@` の直前文字は
 * 空白/行頭に限定しない(限定すると事実上プロンプト先頭でしか発動しなくなるため)。
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
