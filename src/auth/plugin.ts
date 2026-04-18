import { eq } from 'drizzle-orm';
import type {
  FastifyInstance,
  FastifyRequest,
  preHandlerHookHandler,
} from 'fastify';
import fp from 'fastify-plugin';

import { db, schema } from '@/db/index.js';
import { forbidden, unauthorized } from '@/lib/errors.js';

interface AuthenticatedUser {
  userId: number;
  userName: string;
  authKey: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

interface ParsedHeader {
  userId: number;
  key: string;
}

interface CachedUser extends AuthenticatedUser {
  at: number;
}

const parseHeader = (header: unknown): ParsedHeader | null => {
  if (typeof header !== 'string') return null;

  const [idPart, keyPart] = header.split(',');
  if (!idPart || !keyPart) return null;

  const userId = Number.parseInt(idPart, 10);
  if (!Number.isFinite(userId)) return null;

  return { userId, key: keyPart };
};

const cache = new Map<string, CachedUser>();
const CACHE_TTL_MS = 10_000;

const resolveUser = async (
  userId: number,
  key: string,
): Promise<CachedUser | null> => {
  const cached = cache.get(key);
  if (
    cached &&
    cached.userId === userId &&
    Date.now() - cached.at < CACHE_TTL_MS
  ) {
    return cached;
  }

  const row = await db.query.users.findFirst({
    where: eq(schema.users.userId, userId),
  });
  if (!row || row.authKey !== key) return null;

  const entry: CachedUser = {
    userId: row.userId,
    userName: row.userName,
    authKey: row.authKey,
    at: Date.now(),
  };
  cache.set(key, entry);

  return entry;
};

export const invalidateAuthCache = (key: string) => cache.delete(key);

export const authPlugin = fp(async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    const parsed = parseHeader(request.headers['x-authentication']);
    if (!parsed) return;

    const user = await resolveUser(parsed.userId, parsed.key);
    if (user) {
      request.user = {
        userId: user.userId,
        userName: user.userName,
        authKey: user.authKey,
      };
    }
  });
});

export const requireAuth: preHandlerHookHandler = async (request) => {
  if (!request.user) throw unauthorized();
};

export const requireSelf = (paramName = 'userId'): preHandlerHookHandler => {
  return async (request) => {
    if (!request.user) throw unauthorized();

    const params = request.params as Record<string, string>;
    const raw = params[paramName];
    const id =
      raw === '@me' ? request.user.userId : Number.parseInt(raw ?? '', 10);

    if (!Number.isFinite(id) || id !== request.user.userId) throw forbidden();
  };
};
