import type { ZodError, ZodType } from 'zod';

import { badRequest } from '@/lib/errors.js';

const formatIssues = (error: ZodError): string =>
  error.issues
    .map((issue) => {
      const path =
        issue.path.length > 0
          ? issue.path.map((segment) => String(segment)).join('.')
          : '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('; ');

export const parse = <T>(schema: ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw badRequest(formatIssues(result.error));
  return result.data;
};
