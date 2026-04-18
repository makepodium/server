import { env } from '@/env.js';
import { storage } from '@/storage/index.js';

const HIT_TTL_MS = (env.PRESIGNED_TTL_SECONDS * 1_000) / 2;

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
const timers = new Map<string, NodeJS.Timeout>();

const scheduleExpiry = (key: string): void => {
  const previous = timers.get(key);
  if (previous) clearTimeout(previous);

  const timer = setTimeout(() => {
    cache.delete(key);
    timers.delete(key);
  }, HIT_TTL_MS);
  timer.unref();
  timers.set(key, timer);
};

export const primeCachedSignedUrl = (key: string, signedUrl: string): void => {
  cache.set(key, signedUrl);
  scheduleExpiry(key);
};

export const invalidateCachedSignedUrl = (key: string): void => {
  cache.delete(key);
  const timer = timers.get(key);
  if (timer) {
    clearTimeout(timer);
    timers.delete(key);
  }
};

export const getCachedSignedUrl = async (key: string): Promise<string> => {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const existing = inflight.get(key);
  if (existing) return existing;

  const pending = storage
    .presignedGet(key)
    .then((url) => {
      cache.set(key, url);
      scheduleExpiry(key);
      return url;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, pending);
  return pending;
};

export const resetPresignCacheForTests = (): void => {
  cache.clear();
  inflight.clear();
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
};
