import { nanoid } from 'nanoid';

export const newContentId = (length = 16): string => nanoid(length);
