const WINDOW_MS = 5 * 60 * 1_000;

const seen = new Set<string>();

const keyOf = (contentId: string, ip: string): string => `${contentId}::${ip}`;

export const shouldCountView = (contentId: string, ip: string): boolean => {
  const key = keyOf(contentId, ip);
  if (seen.has(key)) return false;

  seen.add(key);
  setTimeout(() => seen.delete(key), WINDOW_MS).unref();
  return true;
};

export const resetViewDedupForTests = (): void => {
  seen.clear();
};
