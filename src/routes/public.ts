import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { db, schema } from '@/db/index.js';
import { resolveContent } from '@/lib/contentCache.js';
import { notFound } from '@/lib/errors.js';
import { storage } from '@/storage/index.js';

const CONTENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

const shareRateLimit = { max: 120, timeWindow: '1 minute' };

const resolveShare = async (
  request: FastifyRequest,
  reply: FastifyReply,
  contentId: string,
) => {
  if (!contentId || !CONTENT_ID_PATTERN.test(contentId)) throw notFound();

  const resolved = await resolveContent(contentId, async () => {
    const row = await db.query.content.findFirst({
      where: eq(schema.content.contentId, contentId),
    });

    if (!row || !row.videoKey) {
      if (!row) {
        request.log.warn({ contentId }, 'share link: content row not found');
      } else {
        request.log.warn(
          { contentId, privacy: row.privacy },
          'share link: no videoKey yet (upload incomplete?)',
        );
      }
      return { videoKey: null, signedUrl: null };
    }

    const signedUrl = await storage.presignedGet(row.videoKey);
    return { videoKey: row.videoKey, signedUrl };
  });

  if (!resolved.videoKey || !resolved.signedUrl) throw notFound();

  return reply.redirect(resolved.signedUrl, 302);
};

export const publicRoutes = async (fastify: FastifyInstance) => {
  fastify.get(
    '/c/:contentId',
    { config: { rateLimit: shareRateLimit } },
    async (request, reply) => {
      const { contentId } = request.params as { contentId: string };
      return resolveShare(request, reply, contentId);
    },
  );

  fastify.get(
    '/games/:gameSlug/clips/:contentId',
    { config: { rateLimit: shareRateLimit } },
    async (request, reply) => {
      const { contentId } = request.params as { contentId: string };
      return resolveShare(request, reply, contentId);
    },
  );
};
