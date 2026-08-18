import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3, BUCKET_NAME } from "./s3-client";

const UPLOAD_URL_EXPIRES_SEC = 300;
const DOWNLOAD_URL_EXPIRES_SEC = 3600;

/** クライアントがbucketへ直接アップロードするためのpresigned PUT URLを発行する。 */
export async function getPresignedUploadUrl(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn: UPLOAD_URL_EXPIRES_SEC });
}

/** クライアントがbucketから直接ダウンロード/再生するためのpresigned GET URLを発行する。 */
export async function getPresignedDownloadUrl(key: string) {
  const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
  return getSignedUrl(s3, command, { expiresIn: DOWNLOAD_URL_EXPIRES_SEC });
}

/**
 * クライアントがbucketから直接「ファイルとして保存」できるpresigned GET URLを発行する。
 * response-content-dispositionをattachmentにすることで、クロスオリジンのbucket URLでも
 * ブラウザが再生ではなく保存ダイアログとして扱う。
 */
export async function getPresignedAttachmentUrl(key: string, filename: string) {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
  });
  return getSignedUrl(s3, command, { expiresIn: DOWNLOAD_URL_EXPIRES_SEC });
}

/** サーバーがプロバイダの生成結果など任意のバイト列をbucketへ保存する。 */
export async function uploadObject(
  key: string,
  body: Uint8Array | Buffer,
  contentType: string
) {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

/** 動画・サムネイル等の関連オブジェクトをまとめて削除する。 */
export async function deleteObjects(keys: string[]) {
  const validKeys = keys.filter((k): k is string => Boolean(k));
  if (validKeys.length === 0) return;

  await s3.send(
    new DeleteObjectsCommand({
      Bucket: BUCKET_NAME,
      Delete: { Objects: validKeys.map((Key) => ({ Key })) },
    })
  );
}
