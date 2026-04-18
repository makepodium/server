interface CachedContent {
  videoKey: string | null;
  at: number;
}

const cache = new Map<string, CachedContent>();

const HIT_TTL_MS = 5 * 60 * 1_000;
const MISS_TTL_MS = 30 * 1_000;

export const getCachedContent = (contentId: string): CachedContent | null => {
  const entry = cache.get(contentId);
  if (!entry) return null;

  const ttl = entry.videoKey === null ? MISS_TTL_MS : HIT_TTL_MS;
  if (Date.now() - entry.at > ttl) {
    cache.delete(contentId);
    return null;
  }

  return entry;
};

export const setCachedContent = (
  contentId: string,
  videoKey: string | null,
): void => {
  cache.set(contentId, { videoKey, at: Date.now() });
};

export const invalidateContentCache = (contentId: string): void => {
  cache.delete(contentId);
};
