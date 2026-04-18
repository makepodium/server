import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isbot } from 'isbot';

import { db, schema } from '@/db/index.js';
import { env } from '@/env.js';
import { getClientIp } from '@/lib/clientIp.js';
import { renderClipPage } from '@/lib/clipPage.js';
import { resolveContent } from '@/lib/contentCache.js';
import { notFound } from '@/lib/errors.js';
import { getCachedSignedUrl } from '@/lib/presignCache.js';
import { shouldCountView } from '@/lib/viewDedup.js';

const PUBLIC_ORIGIN = env.PUBLIC_APP_URL.replace(/\/$/, '');

const CONTENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const SLUG_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const shareRateLimit = { max: 120, timeWindow: '1 minute' };
const pageRateLimit = { max: 60, timeWindow: '1 minute' };

const PAGE_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';

const validateContentId = (contentId: string): void => {
  if (!contentId || !CONTENT_ID_PATTERN.test(contentId)) throw notFound();
};

const validateSlug = (slug: string): void => {
  if (!slug || !SLUG_PATTERN.test(slug)) throw notFound();
};

const resolveShareRedirect = async (
  request: FastifyRequest,
  reply: FastifyReply,
  contentId: string,
) => {
  validateContentId(contentId);

  const resolved = await resolveContent(contentId, async () => {
    const row = await db.query.content.findFirst({
      where: eq(schema.content.contentId, contentId),
    });

    if (!row || !row.videoKey || row.deletedAt) {
      if (!row) {
        request.log.warn({ contentId }, 'share link: content row not found');
      } else if (row.deletedAt) {
        request.log.info({ contentId }, 'share link: content archived');
      } else {
        request.log.warn(
          { contentId, privacy: row.privacy },
          'share link: no videoKey yet (upload incomplete?)',
        );
      }
      return { videoKey: null, signedUrl: null };
    }

    const signedUrl = await getCachedSignedUrl(row.videoKey);
    return { videoKey: row.videoKey, signedUrl };
  });

  if (!resolved.videoKey || !resolved.signedUrl) throw notFound();

  return reply.redirect(resolved.signedUrl, 302);
};

export const publicRoutes = async (fastify: FastifyInstance) => {
  fastify.get(
    '/games/:gameSlug/clips/:contentId',
    { config: { rateLimit: pageRateLimit } },
    async (request, reply) => {
      const { gameSlug, contentId } = request.params as {
        gameSlug: string;
        contentId: string;
      };

      validateSlug(gameSlug);
      validateContentId(contentId);

      if (isbot(request.headers['user-agent'])) {
        return resolveShareRedirect(request, reply, contentId);
      }

      const row = await db.query.content.findFirst({
        where: eq(schema.content.contentId, contentId),
      });

      if (!row || !row.videoKey || row.deletedAt) throw notFound();

      const [user, thumbnailUrl] = await Promise.all([
        db.query.users.findFirst({
          where: eq(schema.users.userId, row.userId),
          columns: {
            userId: true,
            userName: true,
            displayName: true,
            avatarKey: true,
          },
        }),
        row.thumbKey ? getCachedSignedUrl(row.thumbKey) : null,
      ]);

      if (!user) throw notFound();

      const avatarUrl = user.avatarKey
        ? await getCachedSignedUrl(user.avatarKey)
        : null;

      const pageUrl = `${PUBLIC_ORIGIN}/games/${gameSlug}/clips/${contentId}`;
      const videoSrc = `/games/${gameSlug}/clips/${contentId}/video`;

      let views = row.views;
      if (shouldCountView(contentId, getClientIp(request))) {
        views = row.views + 1;
        db.update(schema.content)
          .set({ views: sql`${schema.content.views} + 1` })
          .where(eq(schema.content.contentId, contentId))
          .catch((error) =>
            request.log.warn({ err: error, contentId }, 'view bump failed'),
          );
      }

      const html = renderClipPage({
        contentId: row.contentId,
        title: row.contentTitle ?? '',
        createdAtIso: row.createdAt.toISOString(),
        userName: user.userName,
        displayName: user.displayName,
        avatarUrl,
        videoSrc,
        thumbnailUrl,
        pageUrl,
        views,
      });

      return reply
        .type('text/html; charset=utf-8')
        .header('cache-control', PAGE_CACHE_CONTROL)
        .send(html);
    },
  );

  fastify.get(
    '/games/:gameSlug/clips/:contentId/video',
    { config: { rateLimit: shareRateLimit } },
    async (request, reply) => {
      const { gameSlug, contentId } = request.params as {
        gameSlug: string;
        contentId: string;
      };

      validateSlug(gameSlug);
      return resolveShareRedirect(request, reply, contentId);
    },
  );
};
