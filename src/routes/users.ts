import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireAuth, requireSelf } from '@/auth/plugin.js';
import { db, schema } from '@/db/index.js';
import { notFound, unauthorized } from '@/lib/errors.js';
import { parse } from '@/lib/validate.js';
import { serializeUser } from '@/shapes/user.js';

const currentYear = new Date().getUTCFullYear();

const localeSchema = z
  .string()
  .trim()
  .min(2)
  .max(35)
  .regex(/^[a-zA-Z]{2,3}([-_][a-zA-Z0-9]{2,8})*$/, {
    message: 'invalid languageLocale',
  });

const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(50).optional(),
  bio: z.string().max(500).optional(),
  birthYear: z
    .union([
      z.number().int(),
      z
        .string()
        .regex(/^\d{4}$/)
        .transform(Number),
    ])
    .refine((year) => year >= 1900 && year <= currentYear, {
      message: 'birthYear out of range',
    })
    .optional(),
  languageLocale: localeSchema.optional(),
});

const includeQuerySchema = z.object({
  include: z
    .string()
    .optional()
    .transform((raw) =>
      !raw
        ? []
        : raw
            .split(',')
            .map((part) => part.trim())
            .filter((value) => value.length > 0),
    ),
});

const lookupQuerySchema = includeQuerySchema.extend({
  username: z.string().trim().max(30).optional(),
});

const resolveUserId = (raw: string, selfId: number): number => {
  if (raw === '@me') return selfId;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : -1;
};

const ageBucketFromBirthYear = (birthYear: number | null): string | null => {
  if (birthYear === null) return null;
  const age = new Date().getUTCFullYear() - birthYear;
  if (age < 13) return 'under-13';
  if (age < 18) return '13-17';
  if (age < 25) return '18-24';
  if (age < 35) return '25-34';
  if (age < 45) return '35-44';
  if (age < 55) return '45-54';
  return '55+';
};

export const userRoutes = async (fastify: FastifyInstance) => {
  fastify.get(
    '/users/@me/targeting',
    { preHandler: requireAuth },
    async (request) => {
      if (!request.user) throw unauthorized();

      const user = await db.query.users.findFirst({
        where: eq(schema.users.userId, request.user.userId),
      });
      if (!user) throw notFound();

      const ageRange = ageBucketFromBirthYear(user.birthYear);

      return {
        demographic: ageRange ? { ageRange } : undefined,
      };
    },
  );

  fastify.get('/users', { preHandler: requireAuth }, async (request) => {
    if (!request.user) throw unauthorized();

    const query = parse(lookupQuerySchema, request.query ?? {});
    if (!query.username) return [];

    const user = await db.query.users.findFirst({
      where: eq(schema.users.userName, query.username),
    });
    if (!user) return [];

    const serialized = await serializeUser(user, {
      viewer: request.user,
      includes: query.include,
    });

    return [serialized];
  });

  fastify.get(
    '/users/:userId',
    { preHandler: requireAuth },
    async (request) => {
      if (!request.user) throw unauthorized();

      const { userId } = request.params as { userId: string };
      const id = resolveUserId(userId, request.user.userId);

      const query = parse(includeQuerySchema, request.query ?? {});

      const user = await db.query.users.findFirst({
        where: eq(schema.users.userId, id),
      });
      if (!user) throw notFound();

      return serializeUser(user, {
        viewer: request.user,
        includes: query.include,
      });
    },
  );

  fastify.post(
    '/users/:userId',
    { preHandler: requireSelf('userId') },
    async (request) => {
      if (!request.user) throw unauthorized();

      const body = parse(profileUpdateSchema, request.body ?? {});

      const patch: Partial<typeof schema.users.$inferInsert> = {};
      if (body.displayName !== undefined) patch.displayName = body.displayName;
      if (body.bio !== undefined) patch.bio = body.bio;
      if (body.birthYear !== undefined) patch.birthYear = body.birthYear;
      if (body.languageLocale !== undefined)
        patch.languageLocale = body.languageLocale;

      if (Object.keys(patch).length === 0) {
        const user = await db.query.users.findFirst({
          where: eq(schema.users.userId, request.user.userId),
        });
        return serializeUser(user!, { viewer: request.user });
      }

      const [updated] = await db
        .update(schema.users)
        .set(patch)
        .where(eq(schema.users.userId, request.user.userId))
        .returning();

      return serializeUser(updated!, { viewer: request.user });
    },
  );
};
