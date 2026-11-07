import { isCompetenceMonth, isHexColor } from '@orla/core'
import { z } from 'zod'

export const idSchema = z.uuid({ message: 'ID inválido' })

/** Centavos inteiros (docs/11: valores monetários sempre em centavos). */
export const centsSchema = z
  .number({ message: 'Informe um valor' })
  .int('Valor precisa ser em centavos inteiros')
  .refine(Number.isSafeInteger, 'Valor grande demais')

export const nonNegativeCentsSchema = centsSchema.refine(
  (value) => value >= 0,
  'Não pode ser negativo',
)
export const positiveCentsSchema = centsSchema.refine(
  (value) => value > 0,
  'Precisa ser maior que zero',
)

export const hexColorSchema = z.string().refine(isHexColor, 'Cor inválida (use #RRGGBB)')

/** Mês de competência `YYYY-MM`. */
export const competenceMonthSchema = z
  .string()
  .refine(isCompetenceMonth, 'Mês inválido (use AAAA-MM)')

/** Texto curto obrigatório, sem espaços nas pontas. */
export const nameSchema = (max = 60) =>
  z
    .string({ message: 'Obrigatório' })
    .trim()
    .min(1, 'Obrigatório')
    .max(max, `Use no máximo ${max} caracteres`)

export const dayOfMonthSchema = z
  .number({ message: 'Informe o dia' })
  .int('Dia inválido')
  .min(1, 'Dia entre 1 e 31')
  .max(31, 'Dia entre 1 e 31')

/** Resposta padrão de listas (docs/11). */
export const listResponseSchema = <T extends z.ZodType>(item: T) =>
  z.object({ data: z.array(item), nextCursor: z.string().nullable() })

export type ListResponse<T> = { data: T[]; nextCursor: string | null }

export const timestampsSchema = {
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}
