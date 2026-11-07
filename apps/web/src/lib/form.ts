import type { FieldErrors, FieldValues, Resolver, UseFormSetError, Path } from 'react-hook-form'
import type { z } from 'zod'
import { ApiRequestError } from './api'

/**
 * Resolver do React Hook Form usando os schemas Zod de `@orla/contracts`
 * (mesma validação no front e na API). Implementado aqui para não depender
 * de mais um pacote só para isso.
 */
export function zodResolver<TInput extends FieldValues, TOutput extends FieldValues>(
  schema: z.ZodType<TOutput, TInput>,
): Resolver<TInput, unknown, TOutput> {
  return async (values) => {
    const result = await schema.safeParseAsync(values)
    if (result.success) return { values: result.data, errors: {} }

    const errors: Record<string, { type: string; message: string }> = {}
    for (const issue of result.error.issues) {
      const path = issue.path.join('.') || 'root'
      errors[path] ??= { type: issue.code, message: issue.message }
    }
    return { values: {}, errors: errors as FieldErrors<TInput> }
  }
}

/** Joga os erros por campo da API (`details.fields`) de volta no formulário. Devolve se aplicou algum. */
export function applyApiFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly string[],
): boolean {
  if (!(error instanceof ApiRequestError)) return false
  let applied = false
  for (const field of error.fields) {
    if (fields.includes(field.path)) {
      setError(field.path as Path<T>, { type: 'server', message: field.message })
      applied = true
    }
  }
  return applied
}
