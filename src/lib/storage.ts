import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME!;
const PUBLIC_URL_BASE = process.env.R2_PUBLIC_URL!; // e.g. https://pub-xxxx.r2.dev or a custom domain

export async function uploadPhoto(file: Buffer, contentType: string, prefix: string): Promise<string> {
  const ext = contentType === "image/png" ? "png" : "jpg";
  const key = `${prefix}/${randomUUID()}.${ext}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: file,
      ContentType: contentType,
    })
  );

  return `${PUBLIC_URL_BASE}/${key}`;
}
