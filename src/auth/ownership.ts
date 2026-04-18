import { and, eq } from 'drizzle-orm';
import type { FastifyRequest, preHandlerHookHandler } from 'fastify';

import { db, schema } from '@/db/index.js';
import { forbidden, notFound, unauthorized } from '@/lib/errors.js';

const stringParam = (request: FastifyRequest, name: string): string => {
  const params = request.params as Record<string, string>;
  const raw = params[name];
  if (typeof raw !== 'string' || raw.length === 0) throw forbidden();

  return raw;
};

const stringQuery = (request: FastifyRequest, name: string): string | null => {
  const query = request.query as Record<string, unknown>;
  const raw = query[name];
  if (typeof raw !== 'string' || raw.length === 0) return null;

  return raw;
};

export const requireOwnContent = (
  source: 'param' | 'query' = 'param',
  name = 'contentId',
): preHandlerHookHandler => {
  return async (request) => {
    if (!request.user) throw unauthorized();

    const contentId =
      source === 'param'
        ? stringParam(request, name)
        : stringQuery(request, name);
    if (contentId === null) throw forbidden();

    const row = await db.query.content.findFirst({
      where: and(
        eq(schema.content.contentId, contentId),
        eq(schema.content.userId, request.user.userId),
      ),
    });
    if (!row) throw notFound('content not found');
  };
};

export const requireOwnTask = (name = 'taskId'): preHandlerHookHandler => {
  return async (request) => {
    if (!request.user) throw unauthorized();

    const params = request.params as Record<string, string>;
    const taskId = params[name];
    if (!taskId) throw forbidden();

    const row = await db.query.uploadTasks.findFirst({
      where: and(
        eq(schema.uploadTasks.taskId, taskId),
        eq(schema.uploadTasks.userId, request.user.userId),
      ),
    });
    if (!row) throw notFound('task not found');
  };
};
