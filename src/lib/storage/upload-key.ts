/** アップロードしたオブジェクトのキーの持ち主が違う場合に投げる。 */
export class ForeignUploadKeyError extends Error {}

/** 署名付きURL発行時に使うキーの接頭辞。`/api/uploads/presign` と同じ規則。 */
export function uploadKeyPrefix(userId: string): string {
  return `uploads/${userId}/`;
}

/**
 * 生成リクエストで指定された素材キーが、すべてリクエスト元ユーザーのものであることを検証する。
 *
 * キーはクライアントから渡ってくるので、他人の `uploads/{userId}/...` を指定すれば
 * 他人がアップロードした素材で生成できてしまう（署名付きURLはサーバーが発行するため、
 * キーさえ知っていれば中身を読める）。参照画像・参照動画・参照音声・先頭/末尾フレームの
 * すべてに適用すること。
 */
export function assertOwnedUploadKeys(userId: string, keys: (string | undefined | null)[]) {
  const prefix = uploadKeyPrefix(userId);
  for (const key of keys) {
    if (!key) continue;
    // ".." を含むキーで接頭辞チェックをすり抜けられないようにする
    if (!key.startsWith(prefix) || key.includes("..")) {
      throw new ForeignUploadKeyError("指定された素材を使用する権限がありません");
    }
  }
}
