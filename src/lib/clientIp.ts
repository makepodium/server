import type { FastifyRequest } from 'fastify';

import { env } from '@/env.js';

const PREFER_REAL_IP = Boolean(env.RAILWAY_PUBLIC_DOMAIN);

export const getClientIp = (request: FastifyRequest): string => {
  if (PREFER_REAL_IP) {
    const header = request.headers['x-real-ip'];
    const value = Array.isArray(header) ? header[0] : header;
    if (value) return value;
  }

  return request.ip;
};
