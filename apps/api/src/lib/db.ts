import { idSchema } from '@orla/contracts'
import type { Request } from 'express'
import { conflict, notFound } from './errors.ts'

/** Converte BigInt de centavos do Prisma em number (seguro até ~9e15, regra 1). */
export function centsToNumber(value: bigint): number
export function centsToNumber(value: bigint | null): number | null
export function centsToNumber(value: bigint | null): number | null {
  if (value === null) return null
  const result = Number(value)
  if (!Number.isSafeInteger(result)) throw new RangeError('Valor em centavos fora do limite seguro')
  return result
}

export const toIso = (date: Date): string => date.toISOString()

/** `:id` da URL; ID malformado é tratado como inexistente (404), sem vazar detalhes. */
export function paramId(req: Request, name = 'id'): string {
  const parsed = idSchema.safeParse(req.params[name])
  if (!parsed.success) throw notFound()
  return parsed.data
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
}

/** Traduz violação de índice único (P2002) em 409 CONFLICT com mensagem amigável. */
export async function withUniqueConflict<T>(operation: Promise<T>, message: string): Promise<T> {
  try {
    return await operation
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict(message)
    throw error
  }
}

/** Garante que um registro existe e é do usuário; senão 404 (nunca revela dado de outro usuário). */
export async function ensureFound<T>(
  record: Promise<T | null>,
  message = 'Não encontrado',
): Promise<T> {
  const found = await record
  if (!found) throw notFound(message)
  return found
}
