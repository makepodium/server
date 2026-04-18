import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { requireOwnTask } from '@/auth/ownership.js';
import { requireAuth } from '@/auth/plugin.js';
import { db, schema } from '@/db/index.js';
import { invalidateContentCache } from '@/lib/contentCache.js';
import { badRequest, notFound, unauthorized } from '@/lib/errors.js';
import { generateThumbnail } from '@/media/thumbnail.js';
import { keys, storage } from '@/storage/index.js';

export const taskRoutes = async (fastify: FastifyInstance) => {
  fastify.post(
    '/tasks/:taskId/checksum',
    { preHandler: [requireAuth, requireOwnTask()] },
    async (request) => {
      if (!request.user) throw unauthorized();

      const { taskId } = request.params as { taskId: string };

      const task = await db.query.uploadTasks.findFirst({
        where: eq(schema.uploadTasks.taskId, taskId),
      });
      if (!task) throw notFound();

      const present = await storage.head(task.objectKey);
      if (!present) throw badRequest('object not uploaded yet');

      await db
        .update(schema.uploadTasks)
        .set({ state: 'complete' })
        .where(eq(schema.uploadTasks.taskId, taskId));

      if (task.kind === 'content' && task.contentId != null) {
        const content = await db.query.content.findFirst({
          where: eq(schema.content.contentId, task.contentId),
        });

        await db
          .update(schema.content)
          .set({ uploadState: 'uploaded', uploadedAt: new Date() })
          .where(eq(schema.content.contentId, task.contentId));

        invalidateContentCache(task.contentId);

        if (content && content.hasCustomThumb !== 'true') {
          const thumbKey = keys.thumb(task.contentId);
          const contentId = task.contentId;

          generateThumbnail(task.objectKey, thumbKey)
            .then(() =>
              db
                .update(schema.content)
                .set({ thumbKey })
                .where(eq(schema.content.contentId, contentId)),
            )
            .then(() => invalidateContentCache(contentId))
            .catch((error) =>
              fastify.log.warn({ error, contentId }, 'thumbnail failed'),
            );
        }
      }

      return { state: 'complete' };
    },
  );

  fastify.get(
    '/tasks/:taskId',
    { preHandler: [requireAuth, requireOwnTask()] },
    async (request) => {
      const { taskId } = request.params as { taskId: string };

      const task = await db.query.uploadTasks.findFirst({
        where: eq(schema.uploadTasks.taskId, taskId),
      });
      if (!task) throw notFound();

      return { taskId: task.taskId, state: task.state, kind: task.kind };
    },
  );
};
