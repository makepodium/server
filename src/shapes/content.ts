import type { Content, User } from '@/db/schema.js';
import { env } from '@/env.js';
import { storage } from '@/storage/index.js';

export const serializeContent = async (
  row: Content,
  user: Pick<User, 'userId' | 'userName' | 'avatarKey'>,
) => {
  const [videoUrl, thumbUrl, avatarUrl] = await Promise.all([
    row.videoKey ? storage.presignedGet(row.videoKey) : null,
    row.thumbKey ? storage.presignedGet(row.thumbKey) : null,
    user.avatarKey ? storage.presignedGet(user.avatarKey) : null,
  ]);

  const video = videoUrl ?? '';

  return {
    contentId: row.contentId,
    contentTitle: row.contentTitle,
    categoryId: row.categoryId,
    categoryName: null,

    contentUrl: video,
    contentUrl144p: video,
    contentUrl360p: video,
    contentUrl720p: video,
    contentUrl1080p: video,
    contentThumbnail: thumbUrl ?? '',
    contentShareUrl: `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/c/${row.contentId}`,

    userId: user.userId,
    userName: user.userName,
    userAvatar: avatarUrl ?? '',

    likes: 0,
    comments: 0,
    views: 0,

    duration: row.duration ?? 0,
    privacy: row.privacy,
    createdAt: row.createdAt.toISOString(),
    contentUploadedAt: row.uploadedAt?.toISOString() ?? null,

    tags: [] as string[],
    userTags: [] as unknown[],
    playerTags: [] as unknown[],
    layers: [] as unknown[],
    music: [] as unknown[],
  };
};
