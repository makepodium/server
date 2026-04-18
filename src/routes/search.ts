import { and, eq, ilike, inArray, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireAuth } from '@/auth/plugin.js';
import { db, schema } from '@/db/index.js';
import { unauthorized } from '@/lib/errors.js';
import { parse } from '@/lib/validate.js';
import { type CategoryStub, serializeContent } from '@/shapes/content.js';

const searchQuerySchema = z.object({
  q: z.string().max(200).optional(),
  collection: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// Neutralise LIKE metacharacters before feeding user input to ilike, otherwise
// `%` and `_` would turn every search into a wildcard.
const escapeLike = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');

export const searchRoutes = async (fastify: FastifyInstance) => {
  fastify.get('/search', { preHandler: requireAuth }, async (request) => {
    if (!request.user) throw unauthorized();

    const query = parse(searchQuerySchema, request.query ?? {});

    const collection = query.collection ?? 'content';
    if (collection !== 'content') return { items: [] };

    const searchTerm = (query.q ?? '').trim();
    if (!searchTerm) return { items: [] };

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const rows = await db.query.content.findMany({
      where: and(
        eq(schema.content.userId, request.user.userId),
        ilike(schema.content.contentTitle, `%${escapeLike(searchTerm)}%`),
        isNull(schema.content.deletedAt),
      ),
      limit,
      offset,
    });

    const userRow = await db.query.users.findFirst({
      where: eq(schema.users.userId, request.user.userId),
    });
    if (!userRow) return { items: [] };

    const user = {
      userId: userRow.userId,
      userName: userRow.userName,
      avatarKey: userRow.avatarKey,
    };

    const categoryIds = [
      ...new Set(
        rows.map((row) => row.categoryId).filter((id): id is string => !!id),
      ),
    ];
    const categoryMap = new Map<string, CategoryStub>();
    if (categoryIds.length > 0) {
      const categoryRows = await db.query.categories.findMany({
        where: inArray(schema.categories.categoryId, categoryIds),
      });
      for (const cat of categoryRows) {
        categoryMap.set(cat.categoryId, {
          categoryId: cat.categoryId,
          name: cat.name,
          slug: cat.slug,
          icon: cat.icon,
        });
      }
    }

    const items = await Promise.all(
      rows.map((row) =>
        serializeContent(
          row,
          user,
          row.categoryId ? (categoryMap.get(row.categoryId) ?? null) : null,
        ),
      ),
    );

    return { items };
  });
};
