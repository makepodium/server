import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { db, schema } from '@/db/index.js';
import { getCachedContent, setCachedContent } from '@/lib/contentCache.js';
import { notFound } from '@/lib/errors.js';
import { storage } from '@/storage/index.js';

const CONTENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

export const publicRoutes = async (fastify: FastifyInstance) => {
  fastify.get(
    '/c/:contentId',
    {
      config: {
        rateLimit: { max: 120, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const { contentId } = request.params as { contentId: string };
      if (!contentId || !CONTENT_ID_PATTERN.test(contentId)) throw notFound();

      const cached = getCachedContent(contentId);

      if (cached) {
        if (cached.videoKey === null) throw notFound();
        const signedUrl = await storage.presignedGet(cached.videoKey);
        return reply.redirect(signedUrl, 302);
      }

      const row = await db.query.content.findFirst({
        where: eq(schema.content.contentId, contentId),
      });

      if (!row || !row.videoKey) {
        setCachedContent(contentId, null);
        if (!row) {
          request.log.warn({ contentId }, 'share link: content row not found');
        } else {
          request.log.warn(
            { contentId, privacy: row.privacy },
            'share link: no videoKey yet (upload incomplete?)',
          );
        }
        throw notFound();
      }

      setCachedContent(contentId, row.videoKey);

      const signedUrl = await storage.presignedGet(row.videoKey);

      return reply.redirect(signedUrl, 302);
    },
  );
};
