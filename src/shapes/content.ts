import type { Category, Content, User } from '@/db/schema.js';
import { env } from '@/env.js';
import { getCachedSignedUrl } from '@/lib/presignCache.js';
import { slugFallback } from '@/lib/slugify.js';

export type CategoryStub = Pick<
  Category,
  'categoryId' | 'name' | 'slug' | 'icon'
>;

export const serializeContent = async (
  row: Content,
  user: Pick<User, 'userId' | 'userName' | 'avatarKey'>,
  category?: CategoryStub | null,
) => {
  const [videoUrl, thumbUrl, avatarUrl] = await Promise.all([
    row.videoKey ? getCachedSignedUrl(row.videoKey) : null,
    row.thumbKey ? getCachedSignedUrl(row.thumbKey) : null,
    user.avatarKey ? getCachedSignedUrl(user.avatarKey) : null,
  ]);

  const video = videoUrl ?? '';

  const categoryId = row.categoryId;
  const resolvedCategory =
    category && category.categoryId === categoryId ? category : null;

  const slug =
    resolvedCategory?.slug ?? (categoryId ? slugFallback(categoryId) : 'game');

  const categoryBlock = categoryId
    ? {
        categoryId,
        categoryName: resolvedCategory?.name ?? null,
        icon: resolvedCategory?.icon ?? null,
      }
    : null;

  return {
    contentId: row.contentId,
    contentTitle: row.contentTitle,
    categoryId,
    categoryName: resolvedCategory?.name ?? null,
    category: categoryBlock,

    contentUrl: video,
    contentUrl144p: video,
    contentUrl360p: video,
    contentUrl720p: video,
    contentUrl1080p: video,
    contentThumbnail: thumbUrl ?? '',
    contentShareUrl: `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/games/${slug}/clips/${row.contentId}`,

    userId: user.userId,
    userName: user.userName,
    userAvatar: avatarUrl ?? '',

    likes: 0,
    comments: 0,
    views: row.views,

    duration: row.duration ?? 0,
    privacy: row.privacy,
    createdAt: row.createdAt.toISOString(),
    contentUploadedAt: row.uploadedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,

    tags: [] as string[],
    userTags: [] as unknown[],
    playerTags: [] as unknown[],
    layers: [] as unknown[],
    music: [] as unknown[],
  };
};
