import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { env } from '@/env.js';

const credentials = {
  accessKeyId: env.S3_ACCESS_KEY,
  secretAccessKey: env.S3_SECRET_KEY,
};

const internal = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
});

const publicEndpoint = env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT;

const publicClient =
  publicEndpoint === env.S3_ENDPOINT
    ? internal
    : new S3Client({
        endpoint: publicEndpoint,
        region: env.S3_REGION,
        credentials,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
      });

const bucket = env.S3_BUCKET;

type Operation = 'get' | 'put';

const presign = (
  operation: Operation,
  key: string,
  ttl: number,
  contentType?: string,
) => {
  const command =
    operation === 'get'
      ? new GetObjectCommand({ Bucket: bucket, Key: key })
      : new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: contentType,
        });

  return getSignedUrl(publicClient, command, { expiresIn: ttl });
};

export const storage = {
  presignedGet: (key: string, ttl = env.PRESIGNED_TTL_SECONDS) =>
    presign('get', key, ttl),

  presignedPut: (
    key: string,
    contentType: string,
    ttl = env.PRESIGNED_TTL_SECONDS,
  ) => presign('put', key, ttl, contentType),

  head: async (key: string) => {
    try {
      await internal.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  },

  delete: async (key: string) => {
    await internal.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  },

  putBuffer: async (key: string, body: Buffer, contentType: string) => {
    await internal.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  },
};

export type Storage = typeof storage;
