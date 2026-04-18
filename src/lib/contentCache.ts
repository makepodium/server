import { env } from '@/env.js';

export interface ResolvedContent {
  videoKey: string | null;
  signedUrl: string | null;
}

interface CacheEntry extends ResolvedContent {
  at: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ResolvedContent>>();

const HIT_TTL_MS = (env.PRESIGNED_TTL_SECONDS * 1_000) / 2;
const MISS_TTL_MS = 30 * 1_000;

const isFresh = (entry: CacheEntry): boolean => {
  const ttl = entry.videoKey === null ? MISS_TTL_MS : HIT_TTL_MS;
  return Date.now() - entry.at <= ttl;
};

const readFresh = (contentId: string): CacheEntry | null => {
  const entry = cache.get(contentId);
  if (!entry) return null;
  if (isFresh(entry)) return entry;
  cache.delete(contentId);
  return null;
};

export const resolveContent = async (
  contentId: string,
  loader: () => Promise<ResolvedContent>,
): Promise<ResolvedContent> => {
  const hit = readFresh(contentId);
  if (hit) return hit;

  const existing = inflight.get(contentId);
  if (existing) return existing;

  const pending = loader()
    .then((resolved) => {
      cache.set(contentId, { ...resolved, at: Date.now() });
      return resolved;
    })
    .finally(() => {
      inflight.delete(contentId);
    });

  inflight.set(contentId, pending);
  return pending;
};

export const primeContentCache = (
  contentId: string,
  videoKey: string | null,
  signedUrl: string | null,
): void => {
  cache.set(contentId, { videoKey, signedUrl, at: Date.now() });
};

export const invalidateContentCache = (contentId: string): void => {
  cache.delete(contentId);
};
