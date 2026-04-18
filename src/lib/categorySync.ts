import { sql } from 'drizzle-orm';

import { db, schema } from '@/db/index.js';

const MEDAL_CATEGORIES_URL = 'https://medal.tv/api/categories';
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 60_000;
const CHUNK_SIZE = 500;

interface MedalCategory {
  categoryId?: string;
  categoryName?: string;
  slug?: string;
  icon?: string | null;
  categoryThumbnail?: string | null;
}

const fetchCategories = async (): Promise<MedalCategory[]> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(MEDAL_CATEGORIES_URL, {
      headers: { 'user-agent': 'medal-selfhost/1.0' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`medal.tv /api/categories returned ${response.status}`);
    }

    const data = (await response.json()) as unknown;
    if (!Array.isArray(data)) {
      throw new Error('medal.tv /api/categories did not return an array');
    }

    return data as MedalCategory[];
  } finally {
    clearTimeout(timer);
  }
};

const pickIcon = (entry: MedalCategory): string | null =>
  entry.icon || entry.categoryThumbnail || null;

interface SyncResult {
  fetched: number;
  upserted: number;
  failedChunks: number;
}

export const syncCategoriesFromMedal = async (): Promise<SyncResult> => {
  const entries = await fetchCategories();

  const byCategoryId = new Map<
    string,
    { categoryId: string; name: string; slug: string; icon: string | null }
  >();
  const seenSlugs = new Set<string>();

  for (const entry of entries) {
    const categoryId = entry.categoryId?.trim();
    const name = entry.categoryName?.trim();
    const slug = entry.slug?.trim();
    if (!categoryId || !name || !slug) continue;

    if (byCategoryId.has(categoryId)) continue;
    if (seenSlugs.has(slug)) continue;

    byCategoryId.set(categoryId, {
      categoryId,
      name,
      slug,
      icon: pickIcon(entry),
    });
    seenSlugs.add(slug);
  }

  const rows = [...byCategoryId.values()];
  let upserted = 0;
  let failedChunks = 0;

  for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
    const chunk = rows.slice(index, index + CHUNK_SIZE);

    try {
      await db
        .insert(schema.categories)
        .values(chunk)
        .onConflictDoUpdate({
          target: schema.categories.categoryId,
          set: {
            name: sql`excluded.name`,
            slug: sql`excluded.slug`,
            icon: sql`excluded.icon`,
          },
        });
      upserted += chunk.length;
    } catch {
      failedChunks += 1;
    }
  }

  return { fetched: entries.length, upserted, failedChunks };
};

export const startCategorySync = (logger: {
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
}): void => {
  const run = async () => {
    try {
      const result = await syncCategoriesFromMedal();
      logger.info(result, 'medal category sync complete');
    } catch (error) {
      logger.warn({ err: error }, 'medal category sync failed');
    }
  };

  void run();
  setInterval(run, REFRESH_INTERVAL_MS).unref();
};
