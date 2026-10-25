import { S3Client } from "@aws-sdk/client-s3";

/** Object storage for payment receipts. Files go client → Tigris directly, never through this server. */
export const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: false,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});
