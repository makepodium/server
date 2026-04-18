import type { User } from '@/db/schema.js';
import { getCachedSignedUrl } from '@/lib/presignCache.js';

const pickExt = (key: string | null) =>
  key ? (key.split('.').pop() ?? 'jpg') : null;

const PUBLIC_INCLUDES = new Set([
  'user_stats',
  'user_status',
  'user_icon',
  'socials',
  'user_achievements',
  'user_state',
  'user_game_state',
  'user_platform',
  'user_premium_type',
  'user_active_background',
  'user_active_game_state',
  'user_follow_status',
  'user_donate_config',
]);

const SELF_ONLY_INCLUDES = new Set([
  'user_phone',
  'user_blocked',
  'user_premium_settings',
  'user_contexts',
  'user_connections',
  'user_unread_notification_count',
  'following_categories',
  'user_subscription',
  'user_premium_trial_used',
  'user_profile_layout_configuration',
  'user_profile_expression_tab_setting',
]);

const KNOWN_INCLUDES = new Set([...PUBLIC_INCLUDES, ...SELF_ONLY_INCLUDES]);

export interface SerializeUserOptions {
  viewer?: { userId: number } | null;
  includes?: readonly string[];
}

const buildIncludeFields = (
  user: User,
  keys: readonly string[],
  isSelf: boolean,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};

  for (const key of keys) {
    if (!KNOWN_INCLUDES.has(key)) continue;
    if (SELF_ONLY_INCLUDES.has(key) && !isSelf) continue;

    switch (key) {
      case 'user_stats':
        out.followers = 0;
        out.following = 0;
        out.clips = 0;
        out.clipViews = 0;
        out.totalClipsLength = 0;
        break;

      case 'user_status':
        out.userStatus = { online: false, lastSeenAt: null };
        break;

      case 'user_icon':
        out.userIcon = null;
        break;

      case 'socials':
        out.socials = [];
        break;

      case 'user_achievements':
        out.userAchievements = [];
        break;

      case 'user_state':
        out.userState = { state: 'offline' };
        break;

      case 'user_game_state':
        out.userGameState = null;
        break;

      case 'user_platform':
        out.userPlatform = null;
        break;

      case 'user_premium_type':
        out.userPremiumType = 'PREMIUM_TIER_1';
        break;

      case 'user_active_background':
        out.userActiveBackground = null;
        break;

      case 'user_active_game_state':
        out.userActiveGameState = null;
        break;

      case 'user_follow_status':
        out.userFollowStatus = { following: false, followedBy: false };
        break;

      case 'user_donate_config':
        out.userDonateConfig = null;
        break;

      case 'user_phone':
        out.userPhone = null;
        break;

      case 'user_blocked':
        out.userBlocked = [];
        break;

      case 'user_premium_settings':
        out.userPremiumSettings = {};
        break;

      case 'user_contexts':
        out.userContexts = [];
        break;

      case 'user_connections':
        out.userConnections = [];
        break;

      case 'user_unread_notification_count':
        out.userUnreadNotificationCount = 0;
        break;

      case 'following_categories':
        out.followingCategories = [];
        break;

      case 'user_subscription':
        out.userSubscription = null;
        break;

      case 'user_premium_trial_used':
        out.userPremiumTrialUsed = false;
        break;

      case 'user_profile_layout_configuration':
        out.userProfileLayoutConfiguration = null;
        break;

      case 'user_profile_expression_tab_setting':
        out.userProfileExpressionTabSetting = null;
        break;
    }
  }

  return out;
};

export const serializeUser = async (
  user: User,
  options: SerializeUserOptions = {},
) => {
  const avatarUrl = user.avatarKey
    ? await getCachedSignedUrl(user.avatarKey)
    : null;

  const isSelf = options.viewer?.userId === user.userId;

  const base: Record<string, unknown> = {
    userId: user.userId,
    userName: user.userName,
    displayName: user.displayName,
    bio: user.bio,
    avatar: avatarUrl,
    thumbnail: avatarUrl,
    hasPremium: true,
    premiumType: 'PREMIUM_TIER_1',
    verified: true,
    languageLocale: user.languageLocale,
    createdAt: user.createdAt.toISOString(),
  };

  if (isSelf) {
    base.email = user.email;
    base.birthYear = user.birthYear;
    base.hasPassword = Boolean(user.passwordHash);
  }

  const includes = options.includes;
  if (includes && includes.length > 0) {
    Object.assign(base, buildIncludeFields(user, includes, isSelf));
  }

  return base;
};

export const serializeAuth = async (user: User) => ({
  user: await serializeUser(user, { viewer: { userId: user.userId } }),
  auth: {
    key: user.authKey,
    userName: user.userName,
    avatarExt: pickExt(user.avatarKey),
  },
});
