import type { z } from 'zod'
import { validationError } from './errors.ts'

/** Valida um payload com o schema de `@orla/contracts`; erro 400 VALIDATION com os campos. */
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  const fields = result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))
  throw validationError(fields[0]?.message ?? 'Dados inválidos', { fields })
}
