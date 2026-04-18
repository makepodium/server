import { and, eq, isNull } from 'drizzle-orm';

import { db, schema } from '@/db/index.js';
import type { Content } from '@/db/schema.js';
import { probeVideo } from '@/media/probe.js';
import { storage } from '@/storage/index.js';

import { invalidateContentCache } from './contentCache.js';

const NEGATIVE_CACHE_TTL_MS = 15_000;
const negativeCache = new Map<string, number>();

const isCachedMissing = (contentId: string): boolean => {
  const until = negativeCache.get(contentId);
  if (until === undefined) return false;
  if (until > Date.now()) return true;

  negativeCache.delete(contentId);
  return false;
};

const rememberMissing = (contentId: string): void => {
  negativeCache.set(contentId, Date.now() + NEGATIVE_CACHE_TTL_MS);
};

export const reconcileContentUpload = async <T extends Content>(
  row: T,
): Promise<T> => {
  if (row.uploadedAt || !row.videoKey) return row;
  if (isCachedMissing(row.contentId)) return row;

  const present = await storage.head(row.videoKey).catch(() => false);
  if (!present) {
    rememberMissing(row.contentId);
    return row;
  }

  const uploadedAt = new Date();

  const needsDuration = row.duration === null || row.duration === undefined;
  const probed = needsDuration
    ? await probeVideo(row.videoKey).catch(() => ({ durationSeconds: null }))
    : { durationSeconds: null };

  const durationUpdate =
    probed.durationSeconds !== null ? { duration: probed.durationSeconds } : {};

  const [updated] = await db
    .update(schema.content)
    .set({ uploadState: 'uploaded', uploadedAt, ...durationUpdate })
    .where(
      and(
        eq(schema.content.contentId, row.contentId),
        isNull(schema.content.uploadedAt),
      ),
    )
    .returning();

  invalidateContentCache(row.contentId);

  return {
    ...row,
    uploadState: updated?.uploadState ?? 'uploaded',
    uploadedAt,
    duration: updated?.duration ?? row.duration,
  };
};
