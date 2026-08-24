import { S3Client } from "@aws-sdk/client-s3";

// Railway BucketはVirtual-hosted-style URL(https://{bucket}.{host})を使うため
// forcePathStyleはfalseにする。
//
// ローカル開発でMinIO等のS3互換ストレージを使う場合だけ S3_FORCE_PATH_STYLE=1 を指定する
// (MinIOはVirtual-hosted-styleにDNS設定が必要で、localhostでは解決できないため)。
// 本番(Railway)では未設定のままにすること。
export const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? "auto",
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "1",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

export const BUCKET_NAME = process.env.S3_BUCKET_NAME!;
