import { eq, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  generateAuthKey,
  hashPassword,
  verifyPassword,
} from '@/auth/passwords.js';
import { db, schema } from '@/db/index.js';
import { conflict, forbidden, unauthorized } from '@/lib/errors.js';
import { isRegistrationOpen } from '@/lib/settings.js';
import { parse } from '@/lib/validate.js';
import { serializeAuth } from '@/shapes/user.js';

const passwordSchema = z
  .string()
  .min(12, 'password must be at least 12 characters')
  .refine(
    (value) => Buffer.byteLength(value, 'utf8') <= 72,
    'password must be at most 72 bytes',
  );

const userNameSchema = z
  .string()
  .trim()
  .min(3, 'userName must be at least 3 characters')
  .max(30, 'userName must be at most 30 characters');

const emailSchema = z.string().trim().toLowerCase().email().max(255);

const currentYear = new Date().getUTCFullYear();

const birthYearSchema = z
  .union([
    z.number().int(),
    z
      .string()
      .regex(/^\d{4}$/)
      .transform(Number),
  ])
  .refine((year) => year >= 1900 && year <= currentYear, {
    message: 'birthYear out of range',
  });

const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(255).optional(),
    userName: z.string().trim().max(30).optional(),
    username: z.string().trim().max(30).optional(),
    password: z.string().min(1).max(512),
  })
  .refine((body) => Boolean(body.email ?? body.userName ?? body.username), {
    message: 'email or userName required',
  });

const registerSchema = z
  .object({
    userName: userNameSchema.optional(),
    username: userNameSchema.optional(),
    email: emailSchema,
    password: passwordSchema,
    displayName: z.string().trim().min(1).max(50).optional(),
    birthYear: birthYearSchema.optional(),
  })
  .refine((body) => Boolean(body.userName ?? body.username), {
    message: 'userName required',
  });

const emailCheckSchema = z.object({ email: emailSchema });

const userNameCheckSchema = z
  .object({
    userName: userNameSchema.optional(),
    username: userNameSchema.optional(),
  })
  .refine((body) => Boolean(body.userName ?? body.username), {
    message: 'userName required',
  });

const computePasswordEntropy = (
  password: string,
  relatedWords: string[],
): number => {
  if (!password) return 0;

  let poolSize = 0;
  if (/[a-z]/.test(password)) poolSize += 26;
  if (/[A-Z]/.test(password)) poolSize += 26;
  if (/\d/.test(password)) poolSize += 10;
  if (/[^a-zA-Z\d]/.test(password)) poolSize += 32;

  const uniqueRatio = new Set(password).size / password.length;
  let entropy =
    Math.log2(poolSize || 1) * password.length * Math.sqrt(uniqueRatio);

  const lower = password.toLowerCase();
  const hasRelated = relatedWords.some(
    (word) => word.length > 2 && lower.includes(word.toLowerCase()),
  );
  if (hasRelated) entropy *= 0.5;

  return entropy;
};

const loginRateLimit = { max: 15, timeWindow: '1 minute' };
const registerRateLimit = { max: 10, timeWindow: '1 minute' };
const enumerationRateLimit = { max: 30, timeWindow: '1 minute' };

export const authRoutes = async (fastify: FastifyInstance) => {
  fastify.post(
    '/authentication',
    { config: { rateLimit: loginRateLimit } },
    async (request) => {
      const body = parse(loginSchema, request.body);
      const identifier = body.email ?? body.userName ?? body.username!;

      const user = await db.query.users.findFirst({
        where: or(
          eq(schema.users.email, identifier),
          eq(schema.users.userName, identifier),
        ),
      });
      if (!user) throw unauthorized('Invalid credentials');

      const passwordOk = await verifyPassword(body.password, user.passwordHash);
      if (!passwordOk) throw unauthorized('Invalid credentials');

      return serializeAuth(user);
    },
  );

  fastify.post(
    '/users',
    { config: { rateLimit: registerRateLimit } },
    async (request) => {
      const body = parse(registerSchema, request.body);
      const userName = body.userName ?? body.username!;

      if (!(await isRegistrationOpen()))
        throw forbidden('Registration is closed');

      const existing = await db.query.users.findFirst({
        where: or(
          eq(schema.users.email, body.email),
          eq(schema.users.userName, userName),
        ),
      });
      if (existing) throw conflict('user already exists');

      const passwordHash = await hashPassword(body.password);
      const authKey = generateAuthKey();

      const [user] = await db
        .insert(schema.users)
        .values({
          userName,
          email: body.email,
          displayName: body.displayName ?? userName,
          passwordHash,
          authKey,
          birthYear: body.birthYear,
        })
        .returning();

      return serializeAuth(user!);
    },
  );

  fastify.post(
    '/users/email',
    { config: { rateLimit: enumerationRateLimit } },
    async (request) => {
      const body = parse(emailCheckSchema, request.body);

      const existing = await db.query.users.findFirst({
        where: eq(schema.users.email, body.email),
      });

      return { valid: true, exists: Boolean(existing) };
    },
  );

  fastify.post(
    '/users/username',
    { config: { rateLimit: enumerationRateLimit } },
    async (request) => {
      const body = parse(userNameCheckSchema, request.body);
      const userName = body.userName ?? body.username!;

      const existing = await db.query.users.findFirst({
        where: eq(schema.users.userName, userName),
      });

      return { valid: true, exists: Boolean(existing) };
    },
  );

  fastify.post('/authentication/password', async (request) => {
    const body = request.body as { password?: unknown; relatedWords?: unknown };
    const password = typeof body?.password === 'string' ? body.password : '';
    const relatedWords = Array.isArray(body?.relatedWords)
      ? (body.relatedWords as unknown[]).filter(
          (w): w is string => typeof w === 'string',
        )
      : [];

    const entropy = computePasswordEntropy(password, relatedWords);
    const score = Math.min(4, Math.floor(entropy / 15)) as 0 | 1 | 2 | 3 | 4;

    return {
      valid: true,
      entropy,
      score,
      feedback: { warning: '', suggestions: [] },
    };
  });
};
