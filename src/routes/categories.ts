import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { requireAuth } from '@/auth/plugin.js';
import { db, schema } from '@/db/index.js';
import { notFound } from '@/lib/errors.js';

const serializeCategory = (row: typeof schema.categories.$inferSelect) => ({
  categoryId: row.categoryId,
  categoryName: row.name,
  slug: row.slug,
  icon: row.icon,
});

export const categoryRoutes = async (fastify: FastifyInstance) => {
  fastify.get('/categories', { preHandler: requireAuth }, async () => {
    const rows = await db.query.categories.findMany({
      orderBy: (table, { asc }) => asc(table.name),
    });
    return rows.map(serializeCategory);
  });

  fastify.get(
    '/categories/:categoryId',
    { preHandler: requireAuth },
    async (request) => {
      const { categoryId } = request.params as { categoryId: string };

      const row = await db.query.categories.findFirst({
        where: eq(schema.categories.categoryId, categoryId),
      });
      if (!row) throw notFound();

      return serializeCategory(row);
    },
  );

  fastify.get(
    '/categories/slug/:slug',
    { preHandler: requireAuth },
    async (request) => {
      const { slug } = request.params as { slug: string };

      const row = await db.query.categories.findFirst({
        where: eq(schema.categories.slug, slug),
      });
      if (!row) throw notFound();

      return serializeCategory(row);
    },
  );
};
