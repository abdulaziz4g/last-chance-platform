import { z } from 'zod';
import { ValidationFailedError } from './errors/domain-errors';

/** Single zod->DomainError bridge used by every controller.
 *  Generic over the schema (not the value) so transforms/defaults keep their
 *  OUTPUT type — z.ZodType<T> would collapse input and output. */
export function parseWith<S extends z.ZodTypeAny>(
  schema: S,
  body: unknown,
): z.output<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationFailedError('Request validation failed', {
      issues: result.error.issues,
    });
  }
  return result.data;
}
