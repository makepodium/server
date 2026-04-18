export type { Storage } from './s3.js';
export { storage } from './s3.js';

export const keys = {
  clip: (contentId: string) => `clips/${contentId}.mp4`,
  thumb: (contentId: string) => `thumbs/${contentId}.jpg`,
  avatar: (userId: number, ext: string) => `avatars/${userId}.${ext}`,
};
