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
  user: Pick<User, 'userId' | 'userName' | 'displayName' | 'avatarKey'>,
  category?: CategoryStub | null,
) => {
  const [videoUrl, thumbUrl, avatarUrl] = await Promise.all([
    row.videoKey ? getCachedSignedUrl(row.videoKey) : null,
    row.thumbKey ? getCachedSignedUrl(row.thumbKey) : null,
    user.avatarKey ? getCachedSignedUrl(user.avatarKey) : null,
  ]);

  const video = videoUrl ?? '';
  const thumb = thumbUrl ?? '';
  const avatar = avatarUrl ?? '';

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

  const poster = {
    userId: user.userId,
    userName: user.userName,
    displayName: user.displayName,
    thumbnail: avatar,
    followers: 0,
    following: 0,
    isFollowing: false,
    isFollowedBy: false,
    isBlocked: false,
    isVerified: false,
  };

  return {
    contentId: row.contentId,
    contentTitle: row.contentTitle,
    categoryId,
    categoryName: resolvedCategory?.name ?? null,
    category: categoryBlock,

    contentUrl: video,
    contentUrl144p: video,
    contentUrl240p: video,
    contentUrl360p: video,
    contentUrl480p: video,
    contentUrl720p: video,
    contentUrl1080p: video,

    thumbnailUrl: thumb,
    thumbnail144p: thumb,
    thumbnail240p: thumb,
    thumbnail360p: thumb,
    thumbnail480p: thumb,
    thumbnail720p: thumb,
    thumbnail1080p: thumb,
    contentThumbnail: thumb,

    contentShareUrl: `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/games/${slug}/clips/${row.contentId}`,

    poster,
    userId: user.userId,
    userName: user.userName,
    userAvatar: avatar,

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
