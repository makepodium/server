import type { User } from '@/db/schema.js';
import { storage } from '@/storage/index.js';

const pickExt = (key: string | null) =>
  key ? (key.split('.').pop() ?? 'jpg') : null;

export const serializeUser = async (user: User) => {
  const avatarUrl = user.avatarKey
    ? await storage.presignedGet(user.avatarKey)
    : null;

  return {
    userId: user.userId,
    userName: user.userName,
    email: user.email,
    displayName: user.displayName,
    bio: user.bio,
    avatar: avatarUrl,
    thumbnail: avatarUrl,
    hasPremium: true,
    premiumType: 'PREMIUM_TIER_1',
    verified: true,
    birthYear: user.birthYear,
    createdAt: user.createdAt.toISOString(),
  };
};

export const serializeAuth = async (user: User) => ({
  user: await serializeUser(user),
  auth: {
    key: user.authKey,
    userName: user.userName,
    avatarExt: pickExt(user.avatarKey),
  },
});
