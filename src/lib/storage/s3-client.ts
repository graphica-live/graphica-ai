import { S3Client } from "@aws-sdk/client-s3";

// Railway BucketはVirtual-hosted-style URL(https://{bucket}.{host})を使うため
// forcePathStyleはfalseにする。他のS3互換ストレージに切り替える場合はここを調整する。
export const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? "auto",
  forcePathStyle: false,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

export const BUCKET_NAME = process.env.S3_BUCKET_NAME!;
