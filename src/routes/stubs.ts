import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { requireAuth } from '@/auth/plugin.js';

type StubBody = Record<string, unknown> | unknown[] | null;
type StubMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface StubDef {
  method: StubMethod;
  path: string;
  body: StubBody;
  statusCode?: number;
  public?: boolean;
}

const stubs: StubDef[] = [
  {
    method: 'GET',
    path: '/capabilities',
    body: {
      canUpload: true,
      hasPremium: true,
      uploadImportedClips: true,
      uploadScreenRecordings: true,
      screenRecording: true,
      autoUploads: true,
      downloadWithoutWatermark: true,
      watermarkDisableable: true,
      viewContentViewers: true,
      animatedUserThumbnail: true,
      priorityChatSupport: true,
      skipAds: true,
      uploadedContentMaxDurationSeconds: 3600,
      uploadedContentMaxResolution: 2160,
      uploadedContentMaxFrameRate: 240,
    },
  },
  { method: 'GET', path: '/capabilities/jwt', body: { jwt: 'stub' } },
  { method: 'GET', path: '/auth-providers', body: [], public: true },
  {
    method: 'GET',
    path: '/ip',
    body: { ip: '127.0.0.1', country: 'US' },
    public: true,
  },
  {
    method: 'GET',
    path: '/v2/recaptchaConfig',
    body: {},
    public: true,
  },
  {
    method: 'GET',
    path: '/captcha/config',
    body: {},
    public: true,
  },
  {
    method: 'GET',
    path: '/v2/passwordPolicy',
    body: { minLength: 12, requireUppercase: false, requireNumber: false },
    public: true,
  },
  { method: 'POST', path: '/authentication/sync', body: { token: 'stub' } },
  {
    method: 'POST',
    path: '/authentication/scopedToken',
    body: { token: 'stub', expiresAt: '2099-01-01T00:00:00Z' },
  },

  { method: 'GET', path: '/blocks', body: [] },
  { method: 'GET', path: '/mutes/categories', body: { items: [] } },
  { method: 'GET', path: '/mutes/users', body: { items: [] } },
  { method: 'GET', path: '/users/:userId/following', body: [] },
  { method: 'GET', path: '/users/:userId/followers', body: [] },
  { method: 'GET', path: '/users/:userId/friends', body: [] },
  { method: 'GET', path: '/users/:userId/following/mutual', body: [] },
  { method: 'GET', path: '/users/@me/friendlies', body: [] },

  { method: 'GET', path: '/feeds/content/now', body: { items: [] } },
  { method: 'GET', path: '/feeds/content/followedUsers', body: { items: [] } },
  { method: 'GET', path: '/feeds/content/contentContext', body: { items: [] } },
  { method: 'GET', path: '/feeds/recommended/users', body: [] },
  { method: 'GET', path: '/feeds/recommended/tags', body: [] },

  {
    method: 'GET',
    path: '/notifications',
    body: { notifications: [], unreadCount: 0 },
  },
  {
    method: 'GET',
    path: '/notifications/preferences',
    body: { email: {}, push: {} },
  },
  { method: 'POST', path: '/notifications/read', body: { ok: true } },

  {
    method: 'GET',
    path: '/paddle/subscription',
    body: {
      isPremium: true,
      premiumType: 'pro',
      premiumUntil: '2099-12-31T23:59:59Z',
      status: 'active',
    },
  },
  {
    method: 'GET',
    path: '/premium/subscription',
    body: {
      isPremium: true,
      premiumType: 'pro',
      premiumUntil: '2099-12-31T23:59:59Z',
      status: 'active',
    },
  },

  {
    method: 'GET',
    path: '/zipcode',
    body: { zipcode: '00000', country: 'US', locale: 'en-US', region: '' },
  },

  { method: 'POST', path: '/views', body: null, statusCode: 204 },
  {
    method: 'POST',
    path: '/content/:contentId/likes',
    body: null,
    statusCode: 204,
  },
  {
    method: 'POST',
    path: '/content/:contentId/playerTags/:playerId',
    body: null,
    statusCode: 204,
  },
  { method: 'GET', path: '/content/:contentId/comments', body: { items: [] } },

  { method: 'GET', path: '/quests', body: [] },
  { method: 'GET', path: '/quests/active', body: [] },

  { method: 'GET', path: '/sessions', body: [] },

  { method: 'GET', path: '/gameServers', body: [] },

  { method: 'GET', path: '/discord/guilds', body: [] },

  { method: 'POST', path: '/firestore-auth', body: { token: 'stub' } },

  { method: 'POST', path: '/share/track', body: {} },

  {
    method: 'GET',
    path: '/uploads/content/parameters',
    body: [
      {
        codecName: 'h264',
        videoBitrate: 8000,
        audioBitrate: 192,
        maxWidth: 1920,
        maxHeight: 1080,
        maxFrameRate: 60,
      },
    ],
  },
];

const respond =
  (def: StubDef) => async (_request: FastifyRequest, reply: FastifyReply) => {
    if (def.statusCode === 204) return reply.status(204).send();
    return def.body;
  };

const guessBody = (path: string): { body: StubBody; status: number } => {
  if (path.endsWith('/count')) return { body: { count: 0 }, status: 200 };

  const tail = path.split('/').pop() ?? '';
  if (tail.endsWith('s') || tail === 'feed' || tail === 'items') {
    return { body: [], status: 200 };
  }

  return { body: {}, status: 200 };
};

export const stubRoutes = async (fastify: FastifyInstance) => {
  for (const def of stubs) {
    const handler = respond(def);
    const options = def.public ? {} : { preHandler: requireAuth };

    fastify.route({
      method: def.method,
      url: def.path,
      handler,
      ...options,
    });
  }
};

export const registerCatchAll = (fastify: FastifyInstance) => {
  fastify.setNotFoundHandler(async (request, reply) => {
    if (!request.user)
      return reply.status(401).send({ errorMessage: 'Unauthorized' });

    fastify.log.warn(
      {
        method: request.method,
        path: request.url,
        bodySize: Buffer.isBuffer(request.body)
          ? request.body.length
          : undefined,
      },
      'unmapped endpoint',
    );

    if (request.method === 'GET') {
      const { body, status } = guessBody(request.url.split('?')[0] ?? '');
      return reply.status(status).send(body);
    }

    return reply.status(204).send();
  });
};
