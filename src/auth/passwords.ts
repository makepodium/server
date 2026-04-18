import { randomBytes } from 'node:crypto';

import bcrypt from 'bcrypt';

const ROUNDS = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, ROUNDS);
export const verifyPassword = (plain: string, hash: string) =>
  bcrypt.compare(plain, hash);

export const generateAuthKey = () => randomBytes(32).toString('base64url');
