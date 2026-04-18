import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance } from 'fastify';

import { authPlugin } from '@/auth/plugin.js';
import { env } from '@/env.js';
import { startCategorySync } from '@/lib/categorySync.js';
import { MedalError } from '@/lib/errors.js';
import { FAVICON_BYTES, FAVICON_CACHE_CONTROL } from '@/lib/favicon.js';
import { authRoutes } from '@/routes/auth.js';
import { categoryRoutes } from '@/routes/categories.js';
import { contentRoutes } from '@/routes/content.js';
import { publicRoutes } from '@/routes/public.js';
import { searchRoutes } from '@/routes/search.js';
import { registerCatchAll, stubRoutes } from '@/routes/stubs.js';
import { taskRoutes } from '@/routes/tasks.js';
import { uploadRoutes } from '@/routes/uploads.js';
import { userRoutes } from '@/routes/users.js';

const apiRoutes = async (app: FastifyInstance) => {
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(contentRoutes);
  await app.register(categoryRoutes);
  await app.register(uploadRoutes);
  await app.register(taskRoutes);
  await app.register(searchRoutes);
  await app.register(stubRoutes);
};

const build = async () => {
  const app = Fastify({
    logger: { level: env.NODE_ENV === 'production' ? 'info' : 'debug' },
    trustProxy: true,
    ignoreTrailingSlash: true,
  });

  app.removeContentTypeParser('application/json');
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request, body, done) => {
      const raw = typeof body === 'string' ? body : body.toString('utf8');

      if (raw.trim() === '') {
        done(null, {});
        return;
      }

      try {
        done(null, JSON.parse(raw));
      } catch (error) {
        const wrapped = error as Error & { statusCode?: number };
        wrapped.statusCode = 400;
        done(wrapped, undefined);
      }
    },
  );

  await app.register(sensible);
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    allowList: ['127.0.0.1', '::1'],
  });
  await app.register(authPlugin);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof MedalError) {
      return reply.status(error.statusCode).send(error.toBody());
    }

    request.log.error({ err: error }, 'unhandled error');
    return reply.status(500).send({ errorMessage: 'Internal Server Error' });
  });

  app.get('/', async (_request, reply) => {
    if (env.ROOT_REDIRECT_URL)
      return reply.redirect(env.ROOT_REDIRECT_URL, 302);
    return { ok: true };
  });
  app.get('/health', async () => ({ ok: true }));

  app.get('/favicon.ico', async (_request, reply) =>
    reply
      .type('image/x-icon')
      .header('cache-control', FAVICON_CACHE_CONTROL)
      .send(FAVICON_BYTES),
  );

  await app.register(apiRoutes, { prefix: '/api' });
  await app.register(publicRoutes);
  registerCatchAll(app);

  return app;
};

const main = async () => {
  const app = await build();

  try {
    await app.listen({ host: env.HOST, port: env.PORT });
    startCategorySync(app.log);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void main();

export { build };
