import type { SQL } from 'drizzle-orm';
import { and, asc, desc, eq, gt, inArray, isNull, lt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireOwnContent } from '@/auth/ownership.js';
import { requireAuth, requireSelf } from '@/auth/plugin.js';
import { db, schema } from '@/db/index.js';
import { invalidateContentCache } from '@/lib/contentCache.js';
import { notFound, unauthorized } from '@/lib/errors.js';
import { newContentId } from '@/lib/ids.js';
import { slugify } from '@/lib/slugify.js';
import { parse } from '@/lib/validate.js';
import type { CategoryStub } from '@/shapes/content.js';
import { serializeContent } from '@/shapes/content.js';

const categoryIdSchema = z
  .union([z.string().max(64), z.number(), z.null()])
  .transform((value) => {
    if (value === null) return null;
    return typeof value === 'number' ? String(value) : value;
  });

const metadataSchema = z
  .object({
    duration: z
      .number()
      .finite()
      .min(0)
      .max(24 * 3600)
      .optional(),
    width: z.number().int().min(0).max(16384).optional(),
    height: z.number().int().min(0).max(16384).optional(),
    fps: z.number().finite().min(0).max(1000).optional(),
    fileSize: z
      .number()
      .int()
      .min(0)
      .max(50 * 1024 ** 3)
      .optional(),
  })
  .optional();

const contentBodySchema = z.object({
  contentTitle: z.string().max(200).optional(),
  categoryId: categoryIdSchema.optional(),
  categoryName: z.string().max(120).optional(),
  categorySlug: z.string().max(80).optional(),
  categoryIcon: z.string().max(500).optional(),
  privacy: z.number().int().min(0).max(10).optional(),
  metadata: metadataSchema,
});

type ContentBody = z.infer<typeof contentBodySchema>;

const csvInts = z
  .string()
  .optional()
  .transform((raw) =>
    !raw
      ? []
      : raw
          .split(',')
          .map((part) => Number.parseInt(part.trim(), 10))
          .filter((value) => Number.isFinite(value)),
  );

const csvStrings = z
  .string()
  .optional()
  .transform((raw) =>
    !raw
      ? []
      : raw
          .split(',')
          .map((part) => part.trim())
          .filter((value) => value.length > 0),
  );

const paginationLimit = z.coerce.number().int().min(1).max(100).optional();
const paginationOffset = z.coerce.number().int().min(0).optional();

const listQuerySchema = z.object({
  limit: paginationLimit,
  offset: paginationOffset,
  privacy: csvInts,
  userIds: csvInts,
  from: z.coerce.number().int().optional(),
  sortBy: z.string().max(50).optional(),
  sortDirection: z.enum(['ASC', 'DESC']).optional(),
  newPagination: z.enum(['true', 'false']).optional(),
});

const userContentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10000).optional(),
  offset: paginationOffset,
  privacy: csvInts,
});

const bulkQuerySchema = z.object({
  contentIds: csvStrings,
});

const loadUserForContent = async (userId: number) => {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.userId, userId),
  });
  if (!user) throw notFound();

  return {
    userId: user.userId,
    userName: user.userName,
    avatarKey: user.avatarKey,
  };
};

const loadCategory = async (
  categoryId: string | null | undefined,
): Promise<CategoryStub | null> => {
  if (!categoryId) return null;

  const row = await db.query.categories.findFirst({
    where: eq(schema.categories.categoryId, categoryId),
  });
  if (!row) return null;

  return {
    categoryId: row.categoryId,
    name: row.name,
    slug: row.slug,
    icon: row.icon,
  };
};

const createContentLoaders = () => {
  const userCache = new Map<
    number,
    Awaited<ReturnType<typeof loadUserForContent>>
  >();
  const categoryCache = new Map<string, CategoryStub | null>();

  const getUser = async (userId: number) => {
    const cached = userCache.get(userId);
    if (cached) return cached;

    const loaded = await loadUserForContent(userId);
    userCache.set(userId, loaded);
    return loaded;
  };

  const getCategory = async (categoryId: string | null) => {
    if (!categoryId) return null;
    if (categoryCache.has(categoryId)) return categoryCache.get(categoryId)!;

    const loaded = await loadCategory(categoryId);
    categoryCache.set(categoryId, loaded);
    return loaded;
  };

  return { getUser, getCategory };
};

const ensureUniqueSlug = async (
  desired: string,
  categoryId: string,
): Promise<string> => {
  let slug = desired;
  let suffix = 1;

  while (true) {
    const existing = await db.query.categories.findFirst({
      where: eq(schema.categories.slug, slug),
      columns: { categoryId: true },
    });
    if (!existing || existing.categoryId === categoryId) return slug;

    suffix += 1;
    slug = `${desired}-${suffix}`;
  }
};

const upsertCategory = async (
  categoryId: string | null,
  body: ContentBody,
): Promise<CategoryStub | null> => {
  if (!categoryId) return null;

  const existing = await db.query.categories.findFirst({
    where: eq(schema.categories.categoryId, categoryId),
  });

  const incomingName = body.categoryName?.trim();
  const incomingSlugRaw = body.categorySlug?.trim();
  const incomingIcon = body.categoryIcon?.trim();

  if (existing) {
    const patch: Partial<typeof schema.categories.$inferInsert> = {};
    if (incomingName && incomingName !== existing.name)
      patch.name = incomingName;
    if (incomingIcon && incomingIcon !== existing.icon)
      patch.icon = incomingIcon;

    if (Object.keys(patch).length > 0) {
      await db
        .update(schema.categories)
        .set(patch)
        .where(eq(schema.categories.categoryId, categoryId));
    }

    return {
      categoryId: existing.categoryId,
      name: patch.name ?? existing.name,
      slug: existing.slug,
      icon: patch.icon ?? existing.icon,
    };
  }

  const nameForSlug = incomingSlugRaw || incomingName || `game-${categoryId}`;
  const desiredSlug = slugify(nameForSlug);
  const slug = await ensureUniqueSlug(desiredSlug, categoryId);
  const name = incomingName || categoryId;
  const icon = incomingIcon ?? null;

  await db.insert(schema.categories).values({
    categoryId,
    name,
    slug,
    icon,
  });

  return { categoryId, name, slug, icon };
};

const buildContentPatch = (
  body: ContentBody,
): Partial<typeof schema.content.$inferInsert> => {
  const patch: Partial<typeof schema.content.$inferInsert> = {};

  if (body.contentTitle !== undefined) patch.contentTitle = body.contentTitle;
  if (body.categoryId !== undefined) patch.categoryId = body.categoryId;
  if (body.privacy !== undefined) patch.privacy = body.privacy;

  const metadata = body.metadata;
  if (!metadata) return patch;

  if (metadata.duration !== undefined) patch.duration = metadata.duration;
  if (metadata.width !== undefined) patch.width = metadata.width;
  if (metadata.height !== undefined) patch.height = metadata.height;
  if (metadata.fps !== undefined) patch.fps = metadata.fps;
  if (metadata.fileSize !== undefined) patch.fileSize = metadata.fileSize;

  return patch;
};

export const contentRoutes = async (fastify: FastifyInstance) => {
  fastify.post(
    '/users/:userId/content',
    { preHandler: requireSelf('userId') },
    async (request) => {
      if (!request.user) throw unauthorized();

      const body = parse(contentBodySchema, request.body ?? {});
      const metadata = body.metadata ?? {};

      const categoryId = body.categoryId ?? null;
      const category = await upsertCategory(categoryId, body);

      const [row] = await db
        .insert(schema.content)
        .values({
          contentId: newContentId(),
          userId: request.user.userId,
          contentTitle: body.contentTitle ?? '',
          categoryId,
          privacy: body.privacy ?? 3,
          duration: metadata.duration ?? null,
          width: metadata.width ?? null,
          height: metadata.height ?? null,
          fps: metadata.fps ?? null,
          fileSize: metadata.fileSize ?? null,
        })
        .returning();

      const user = await loadUserForContent(request.user.userId);

      return serializeContent(row!, user, category);
    },
  );

  fastify.get(
    '/users/:userId/content',
    { preHandler: requireAuth },
    async (request) => {
      if (!request.user) throw unauthorized();

      const { userId } = request.params as { userId: string };
      const targetId =
        userId === '@me' ? request.user.userId : Number.parseInt(userId, 10);
      if (!Number.isFinite(targetId)) return { content: [] };

      const query = parse(userContentQuerySchema, request.query ?? {});
      const limit = query.limit ?? 100;
      const offset = query.offset ?? 0;
      const privacyFilter = query.privacy;

      const filters: SQL[] = [
        eq(schema.content.userId, targetId),
        isNull(schema.content.deletedAt),
      ];
      if (privacyFilter.length > 0)
        filters.push(inArray(schema.content.privacy, privacyFilter));

      const rows = await db.query.content.findMany({
        where: and(...filters),
        orderBy: desc(schema.content.createdAt),
        limit,
        offset,
        columns: { contentId: true, createdAt: true },
      });

      const content = rows.map((row) => [
        row.contentId,
        row.createdAt.getTime(),
      ]);

      return { content };
    },
  );

  fastify.get('/content/bulk', { preHandler: requireAuth }, async (request) => {
    if (!request.user) throw unauthorized();

    const query = parse(bulkQuerySchema, request.query ?? {});
    const ids = query.contentIds;
    if (ids.length === 0) return { items: [] };

    const rows = await db.query.content.findMany({
      where: inArray(schema.content.contentId, ids),
    });

    const { getUser, getCategory } = createContentLoaders();

    const byId = new Map(rows.map((row) => [row.contentId, row]));
    const tombstone = new Date().toISOString();

    const items = await Promise.all(
      ids.map(async (id) => {
        const row = byId.get(id);
        if (row) {
          const [user, category] = await Promise.all([
            getUser(row.userId),
            getCategory(row.categoryId),
          ]);
          return serializeContent(row, user, category);
        }

        return { contentId: id, deletedAt: tombstone };
      }),
    );

    return { items };
  });

  fastify.get('/content', { preHandler: requireAuth }, async (request) => {
    if (!request.user) throw unauthorized();

    const query = parse(listQuerySchema, request.query ?? {});
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const privacyFilter = query.privacy;
    const paginated = query.newPagination === 'true';

    if (paginated) return { items: [], meta: null };

    const targetUserIds =
      query.userIds.length > 0 ? query.userIds : [request.user.userId];

    const filters: SQL[] = [
      inArray(schema.content.userId, targetUserIds),
      isNull(schema.content.deletedAt),
    ];
    if (privacyFilter.length > 0)
      filters.push(inArray(schema.content.privacy, privacyFilter));

    if (query.from !== undefined) {
      const cursor = new Date(query.from);
      filters.push(
        query.sortDirection === 'ASC'
          ? gt(schema.content.createdAt, cursor)
          : lt(schema.content.createdAt, cursor),
      );
    }

    const order =
      query.sortDirection === 'ASC'
        ? asc(schema.content.createdAt)
        : desc(schema.content.createdAt);

    const rows = await db.query.content.findMany({
      where: and(...filters),
      orderBy: order,
      limit,
      offset,
    });

    const { getUser, getCategory } = createContentLoaders();

    return Promise.all(
      rows.map(async (row) => {
        const [user, category] = await Promise.all([
          getUser(row.userId),
          getCategory(row.categoryId),
        ]);
        return serializeContent(row, user, category);
      }),
    );
  });

  fastify.get(
    '/content/:contentId',
    { preHandler: [requireAuth, requireOwnContent('param')] },
    async (request) => {
      if (!request.user) throw unauthorized();

      const { contentId } = request.params as { contentId: string };

      const row = await db.query.content.findFirst({
        where: eq(schema.content.contentId, contentId),
      });
      if (!row || row.deletedAt) throw notFound();

      const [user, category] = await Promise.all([
        loadUserForContent(row.userId),
        loadCategory(row.categoryId),
      ]);

      return serializeContent(row, user, category);
    },
  );

  fastify.post(
    '/content/:contentId',
    { preHandler: [requireAuth, requireOwnContent('param')] },
    async (request) => {
      if (!request.user) throw unauthorized();

      const { contentId } = request.params as { contentId: string };
      const body = parse(contentBodySchema, request.body ?? {});
      const patch = buildContentPatch(body);

      if (body.categoryId !== undefined && body.categoryId !== null) {
        await upsertCategory(body.categoryId, body);
      }

      const row =
        Object.keys(patch).length === 0
          ? await db.query.content.findFirst({
              where: eq(schema.content.contentId, contentId),
            })
          : (
              await db
                .update(schema.content)
                .set(patch)
                .where(
                  and(
                    eq(schema.content.contentId, contentId),
                    isNull(schema.content.deletedAt),
                  ),
                )
                .returning()
            )[0];
      if (!row || row.deletedAt) throw notFound();

      if (Object.keys(patch).length > 0) invalidateContentCache(contentId);

      const [user, category] = await Promise.all([
        loadUserForContent(row.userId),
        loadCategory(row.categoryId),
      ]);

      return serializeContent(row, user, category);
    },
  );

  fastify.delete(
    '/content/:contentId',
    { preHandler: [requireAuth, requireOwnContent('param')] },
    async (request) => {
      const { contentId } = request.params as { contentId: string };

      const row = await db.query.content.findFirst({
        where: eq(schema.content.contentId, contentId),
      });
      if (!row || row.deletedAt) throw notFound();

      await db
        .update(schema.content)
        .set({ deletedAt: new Date() })
        .where(eq(schema.content.contentId, contentId));

      invalidateContentCache(contentId);

      return { deleted: true };
    },
  );
};
