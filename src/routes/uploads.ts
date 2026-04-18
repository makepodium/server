import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { requireOwnContent } from '@/auth/ownership.js';
import { requireAuth } from '@/auth/plugin.js';
import { db, schema } from '@/db/index.js';
import { invalidateContentCache } from '@/lib/contentCache.js';
import { unauthorized } from '@/lib/errors.js';
import { parse } from '@/lib/validate.js';
import { keys, storage } from '@/storage/index.js';

const uploadBodySchema = z
  .object({
    resumable: z.boolean().optional(),
    contentLength: z
      .number()
      .int()
      .min(0)
      .max(50 * 1024 ** 3)
      .optional(),
    contentType: z.string().min(1).max(100).optional(),
    crc32c: z.string().max(32).nullable().optional(),
    encoded: z.boolean().optional(),
    custom: z.boolean().optional(),
  })
  .optional();

const contentIdQuerySchema = z.object({
  contentId: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, 'invalid contentId'),
});

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const extensionFromContentType = (contentType: string): string =>
  EXTENSION_BY_CONTENT_TYPE[contentType.toLowerCase()] ?? 'bin';

export const uploadRoutes = async (fastify: FastifyInstance) => {
  fastify.post(
    '/uploads/content',
    { preHandler: [requireAuth, requireOwnContent('query')] },
    async (request) => {
      if (!request.user) throw unauthorized();

      const { contentId } = parse(contentIdQuerySchema, request.query ?? {});
      const body = parse(uploadBodySchema, request.body ?? {}) ?? {};

      const key = keys.clip(contentId);
      const contentType = body.contentType ?? 'video/mp4';
      const signedUrl = await storage.presignedPut(key, contentType);
      const taskId = randomUUID();

      await db
        .update(schema.content)
        .set({ videoKey: key })
        .where(eq(schema.content.contentId, contentId));

      invalidateContentCache(contentId);

      await db.insert(schema.uploadTasks).values({
        taskId,
        userId: request.user.userId,
        contentId,
        kind: 'content',
        objectKey: key,
      });

      return {
        signedUrl,
        taskId,
        temporaryAssetUrl: await storage.presignedGet(key),
      };
    },
  );

  fastify.post(
    '/uploads/contentThumbnail',
    { preHandler: [requireAuth, requireOwnContent('query')] },
    async (request) => {
      if (!request.user) throw unauthorized();

      const { contentId } = parse(contentIdQuerySchema, request.query ?? {});
      const body = parse(uploadBodySchema, request.body ?? {}) ?? {};

      const key = keys.thumb(contentId);
      const contentType = body.contentType ?? 'image/jpeg';
      const signedUrl = await storage.presignedPut(key, contentType);
      const taskId = randomUUID();

      await db
        .update(schema.content)
        .set({ thumbKey: key, hasCustomThumb: 'true' })
        .where(eq(schema.content.contentId, contentId));

      invalidateContentCache(contentId);

      await db.insert(schema.uploadTasks).values({
        taskId,
        userId: request.user.userId,
        contentId,
        kind: 'thumbnail',
        objectKey: key,
      });

      return {
        signedUrl,
        taskId,
        temporaryAssetUrl: await storage.presignedGet(key),
      };
    },
  );

  fastify.post(
    '/uploads/avatar',
    { preHandler: requireAuth },
    async (request) => {
      if (!request.user) throw unauthorized();

      const body = parse(uploadBodySchema, request.body ?? {}) ?? {};
      const contentType = body.contentType ?? 'image/jpeg';
      const extension = extensionFromContentType(contentType);

      const key = keys.avatar(request.user.userId, extension);
      const signedUrl = await storage.presignedPut(key, contentType);
      const taskId = randomUUID();

      await db
        .update(schema.users)
        .set({ avatarKey: key })
        .where(eq(schema.users.userId, request.user.userId));

      await db.insert(schema.uploadTasks).values({
        taskId,
        userId: request.user.userId,
        kind: 'avatar',
        objectKey: key,
      });

      return {
        signedUrl,
        taskId,
        temporaryAssetUrl: await storage.presignedGet(key),
      };
    },
  );

  const acceptAvatarLike = async (request: FastifyRequest) => {
    if (!request.user) throw unauthorized();

    const body = parse(uploadBodySchema, request.body ?? {}) ?? {};
    const contentType = body.contentType ?? 'image/jpeg';
    const extension = extensionFromContentType(contentType);

    const key = `misc/${request.user.userId}/${randomUUID()}.${extension}`;
    const signedUrl = await storage.presignedPut(key, contentType);
    const taskId = randomUUID();

    await db.insert(schema.uploadTasks).values({
      taskId,
      userId: request.user.userId,
      kind: 'misc',
      objectKey: key,
    });

    return {
      signedUrl,
      taskId,
      temporaryAssetUrl: await storage.presignedGet(key),
    };
  };

  for (const path of [
    '/uploads/coverPhoto',
    '/uploads/screenshot',
    '/uploads/chatImage',
    '/uploads/nuggetImage',
  ]) {
    fastify.post(path, { preHandler: requireAuth }, acceptAvatarLike);
  }

  fastify.post('/uploads/debugLog', { preHandler: requireAuth }, async () => ({
    signedUrl: null,
    taskId: randomUUID(),
  }));
};
