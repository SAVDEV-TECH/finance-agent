import fs from 'fs/promises';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ENV } from './_core/env';

const LOCAL_STORAGE_DIR = process.env.VERCEL
  ? '/tmp/finance-agent-data/storage'
  : path.resolve(process.cwd(), '.data/storage');

function getS3Client(): S3Client | null {
  if (ENV.s3Bucket && ENV.s3AccessKeyId && ENV.s3SecretAccessKey) {
    return new S3Client({
      region: ENV.s3Region,
      endpoint: ENV.s3Endpoint || undefined,
      credentials: {
        accessKeyId: ENV.s3AccessKeyId,
        secretAccessKey: ENV.s3SecretAccessKey,
      },
      forcePathStyle: Boolean(ENV.s3Endpoint),
    });
  }
  return null;
}

/**
 * Stores an uploaded file in S3/R2 when configured, or falls back to
 * local disk storage served via the /api/storage proxy route.
 */
export async function storagePut(
  fileKey: string,
  buffer: Buffer,
  contentType: string
): Promise<{ key: string; url: string }> {
  const sanitizedKey = fileKey.replace(/[^a-zA-Z0-9._/-]/g, '_');
  const s3 = getS3Client();

  if (s3 && ENV.s3Bucket) {
    await s3.send(
      new PutObjectCommand({
        Bucket: ENV.s3Bucket,
        Key: sanitizedKey,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return {
      key: sanitizedKey,
      url: `/api/storage/${encodeURIComponent(sanitizedKey)}`,
    };
  }

  const targetPath = path.join(LOCAL_STORAGE_DIR, sanitizedKey);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, buffer);

  return {
    key: sanitizedKey,
    url: `/api/storage/${encodeURIComponent(sanitizedKey)}`,
  };
}

export async function storageGetLocalPath(fileKey: string): Promise<string> {
  const sanitizedKey = fileKey.replace(/[^a-zA-Z0-9._/-]/g, '_');
  const resolved = path.resolve(LOCAL_STORAGE_DIR, sanitizedKey);
  if (!resolved.startsWith(LOCAL_STORAGE_DIR)) {
    throw new Error('Invalid storage path');
  }
  return resolved;
}
