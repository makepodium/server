import { relations } from 'drizzle-orm';
import {
  bigint,
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    userId: serial('user_id').primaryKey(),
    userName: text('user_name').notNull(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    bio: text('bio').notNull().default(''),
    avatarKey: text('avatar_key'),
    birthYear: integer('birth_year'),
    passwordHash: text('password_hash').notNull(),
    authKey: text('auth_key').notNull(),
    languageLocale: text('language_locale').notNull().default('en'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userNameUnique: uniqueIndex('users_user_name_unique').on(table.userName),
    emailUnique: uniqueIndex('users_email_unique').on(table.email),
    authKeyIdx: index('users_auth_key_idx').on(table.authKey),
  }),
);

export const content = pgTable(
  'content',
  {
    contentId: text('content_id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.userId, { onDelete: 'cascade' }),
    contentTitle: text('content_title').notNull().default(''),
    categoryId: text('category_id'),
    duration: doublePrecision('duration'),
    width: integer('width'),
    height: integer('height'),
    fps: integer('fps'),
    fileSize: bigint('file_size', { mode: 'number' }),
    privacy: smallint('privacy').notNull().default(3),
    uploadState: text('upload_state').notNull().default('pending'),
    videoKey: text('video_key'),
    thumbKey: text('thumb_key'),
    hasCustomThumb: text('has_custom_thumb').notNull().default('false'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }),
  },
  (table) => ({
    userCreatedIdx: index('content_user_created_idx').on(
      table.userId,
      table.createdAt,
    ),
    titleSearchIdx: index('content_title_idx').on(table.contentTitle),
  }),
);

export const uploadTasks = pgTable('upload_tasks', {
  taskId: text('task_id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.userId, { onDelete: 'cascade' }),
  contentId: text('content_id').references(() => content.contentId, {
    onDelete: 'cascade',
  }),
  kind: text('kind').notNull(),
  objectKey: text('object_key').notNull(),
  state: text('state').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  content: many(content),
  tasks: many(uploadTasks),
}));

export const contentRelations = relations(content, ({ one, many }) => ({
  user: one(users, { fields: [content.userId], references: [users.userId] }),
  tasks: many(uploadTasks),
}));

export const uploadTasksRelations = relations(uploadTasks, ({ one }) => ({
  user: one(users, {
    fields: [uploadTasks.userId],
    references: [users.userId],
  }),
  content: one(content, {
    fields: [uploadTasks.contentId],
    references: [content.contentId],
  }),
}));

export type User = typeof users.$inferSelect;
export type Content = typeof content.$inferSelect;
