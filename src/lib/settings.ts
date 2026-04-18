import { count } from 'drizzle-orm';

import { db, schema } from '@/db/index.js';

export const isRegistrationOpen = async (): Promise<boolean> => {
  const [row] = await db.select({ value: count() }).from(schema.users);
  const userCount = row?.value ?? 0;

  return userCount === 0;
};
