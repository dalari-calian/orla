import type { Category } from '@orla/contracts'
import type { z } from 'zod'
import { ApiRequestError } from '@/lib/api'

export type FieldErrors = Partial<Record<string, string>>

/** Primeiro erro de cada campo de uma validação Zod (mesmo schema da API). */
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'form'
    errors[path] ??= issue.message
  }
  return errors
}

/** Erros por campo devolvidos pela API (`details.fields`); o resto vira erro geral. */
export function apiFieldErrors(error: unknown): FieldErrors | null {
  if (!(error instanceof ApiRequestError) || error.fields.length === 0) return null
  const errors: FieldErrors = {}
  for (const field of error.fields) errors[field.path] ??= field.message
  return errors
}

/** Categorias do tipo, com as subcategorias logo depois do pai ("Mercado › Feira"). */
export function categoryOptions(categories: readonly Category[], kind: 'income' | 'expense') {
  const ofKind = categories.filter((category) => category.kind === kind)
  const parents = ofKind.filter((category) => category.parentId === null)
  return parents.flatMap((parent) => [
    { category: parent, label: parent.name },
    ...ofKind
      .filter((child) => child.parentId === parent.id)
      .map((child) => ({ category: child, label: `${parent.name} › ${child.name}` })),
  ])
}
