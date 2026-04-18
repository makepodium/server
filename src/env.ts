import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const boolFrom = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined) return defaultValue;
      return value === '1' || value.toLowerCase() === 'true';
    });

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(8080),
    HOST: z.string().default('0.0.0.0'),

    DATABASE_URL: z.string().url(),

    S3_ENDPOINT: z.string().url(),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: boolFrom(false),
    S3_PUBLIC_ENDPOINT: z.string().url().optional(),

    PRESIGNED_TTL_SECONDS: z.coerce.number().int().positive().default(300),

    PUBLIC_APP_URL: z.string().url().default('http://localhost:8080'),

    ROOT_REDIRECT_URL: z.string().url().optional(),

    RAILWAY_PUBLIC_DOMAIN: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
