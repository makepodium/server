import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const TEMPLATE_PATH = fileURLToPath(
  new URL('../templates/clipPage.html', import.meta.url),
);
const TEMPLATE = readFileSync(TEMPLATE_PATH, 'utf8');

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => HTML_ESCAPE[char] ?? char);

const escapeAttr = escapeHtml;

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
};

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

const plural = (count: number, unit: string): string =>
  `${count} ${unit}${count === 1 ? '' : 's'} ago`;

const formatRelativeTime = (iso: string, now: number = Date.now()): string => {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';

  const diff = Math.max(0, now - ts);

  if (diff < 45 * SECOND) return 'just now';
  if (diff < 90 * SECOND) return '1 minute ago';
  if (diff < HOUR) return plural(Math.floor(diff / MINUTE), 'minute');
  if (diff < DAY) return plural(Math.floor(diff / HOUR), 'hour');
  if (diff < WEEK) return plural(Math.floor(diff / DAY), 'day');
  if (diff < MONTH) return plural(Math.floor(diff / WEEK), 'week');
  if (diff < YEAR) return plural(Math.floor(diff / MONTH), 'month');
  return plural(Math.floor(diff / YEAR), 'year');
};

const truncate = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;

const formatViews = (count: number): string => {
  const safe = Math.max(0, Math.floor(count));
  if (safe === 1) return '1 view';
  if (safe < 1_000) return `${safe} views`;

  const trim = (value: number): string => value.toFixed(1).replace(/\.0$/, '');

  if (safe < 10_000) return `${trim(safe / 1_000)}K views`;
  if (safe < 1_000_000) return `${Math.floor(safe / 1_000)}K views`;
  if (safe < 10_000_000) return `${trim(safe / 1_000_000)}M views`;
  return `${Math.floor(safe / 1_000_000)}M views`;
};

export interface ClipPageData {
  contentId: string;
  title: string;
  createdAtIso: string;
  userName: string;
  displayName: string | null;
  avatarUrl: string | null;
  videoSrc: string;
  thumbnailUrl: string | null;
  pageUrl: string;
  views: number;
}

const buildAvatarHtml = (
  avatarUrl: string | null,
  authorName: string,
): string => {
  if (avatarUrl) {
    return `<img class="avatar" src="${escapeAttr(avatarUrl)}" alt="" width="40" height="40">`;
  }

  const initial = authorName.charAt(0).toUpperCase() || '?';
  return `<div class="avatar avatar-fallback" aria-hidden="true">${escapeHtml(initial)}</div>`;
};

const buildOgVideoTags = (videoSrc: string): string =>
  `<meta property="og:video" content="${escapeAttr(videoSrc)}">
    <meta property="og:video:secure_url" content="${escapeAttr(videoSrc)}">
    <meta property="og:video:type" content="video/mp4">`;

const buildOgImageTags = (thumbnailUrl: string | null): string => {
  if (!thumbnailUrl) return '';

  return `<meta property="og:image" content="${escapeAttr(thumbnailUrl)}">
    <meta name="twitter:image" content="${escapeAttr(thumbnailUrl)}">`;
};

const fillTemplate = (tokens: Record<string, string>): string =>
  TEMPLATE.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = tokens[key];
    return value !== undefined ? value : match;
  });

export const renderClipPage = (data: ClipPageData): string => {
  const title = data.title.trim() || 'Untitled clip';
  const authorName =
    (data.displayName ?? data.userName).trim() || data.userName;
  const absoluteDate = formatDate(data.createdAtIso);
  const relativeDate = formatRelativeTime(data.createdAtIso);
  const pageTitle = truncate(`${title} - Podium`, 120);
  const ogDescription = truncate(`${authorName} on Medal`, 180);

  return fillTemplate({
    PAGE_TITLE: escapeHtml(pageTitle),
    TITLE: escapeHtml(title),
    OG_DESCRIPTION: escapeAttr(ogDescription),
    PAGE_URL: escapeAttr(data.pageUrl),
    USER_NAME: escapeHtml(authorName),
    DATE_ISO: escapeAttr(data.createdAtIso),
    DATE_RELATIVE: escapeHtml(relativeDate),
    DATE_ABSOLUTE: escapeAttr(absoluteDate),
    VIEWS_PRETTY: escapeHtml(formatViews(data.views)),
    VIDEO_SRC: escapeAttr(data.videoSrc),
    POSTER_ATTR: data.thumbnailUrl
      ? ` poster="${escapeAttr(data.thumbnailUrl)}"`
      : '',
    AVATAR_HTML: buildAvatarHtml(data.avatarUrl, authorName),
    OG_VIDEO_TAGS: buildOgVideoTags(data.videoSrc),
    OG_IMAGE_TAGS: buildOgImageTags(data.thumbnailUrl),
  });
};
