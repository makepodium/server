function trimEdgeHyphens(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s[start] === '-') start++;
  while (end > start && s[end - 1] === '-') end--;
  return start === 0 && end === s.length ? s : s.slice(start, end);
}

export const slugify = (value: string): string => {
  const base = trimEdgeHyphens(
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/['\u2019]/g, '')
      .replace(/[^a-z0-9]+/g, '-'),
  ).slice(0, 64);

  return base.length > 0 ? base : 'game';
};

export const slugFallback = (categoryId: string): string =>
  `game-${slugify(categoryId)}`;
