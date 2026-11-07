import { z } from 'zod'
import { idSchema } from './common.ts'

/** docs/02 › Autenticação: 3–30 caracteres `[a-z0-9_.]`, único, sem diferenciar maiúsculas. */
export const usernameSchema = z
  .string({ message: 'Informe o usuário' })
  .trim()
  .toLowerCase()
  .min(3, 'Use pelo menos 3 caracteres')
  .max(30, 'Use no máximo 30 caracteres')
  .regex(/^[a-z0-9_.]+$/, 'Use só letras, números, ponto e sublinhado')

/** Tamanho em bytes UTF-8 (sem depender de TextEncoder, que não existe em todo runtime). */
function utf8Length(value: string): number {
  let bytes = 0
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
  }
  return bytes
}

/** Mínimo 8. Máximo 72 bytes por limite do bcrypt (que ignora o que passar disso). */
export const passwordSchema = z
  .string({ message: 'Informe a senha' })
  .min(8, 'Use pelo menos 8 caracteres')
  .max(64, 'Use no máximo 64 caracteres')
  .refine((value) => utf8Length(value) <= 72, 'Senha longa demais')

export const signupModeSchema = z.enum(['invite', 'open', 'closed'])
export type SignupMode = z.infer<typeof signupModeSchema>

/** GET /auth/config — público: diz à tela de cadastro se precisa de convite. */
export const authConfigResponseSchema = z.object({ signupMode: signupModeSchema })
export type AuthConfigResponse = z.infer<typeof authConfigResponseSchema>

export const registerRequestSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  displayName: z.string().trim().max(60, 'Use no máximo 60 caracteres').optional(),
  inviteCode: z.string().trim().max(100).optional(),
})
export type RegisterRequest = z.infer<typeof registerRequestSchema>

export const loginRequestSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, 'Informe o usuário').max(30),
  password: z.string().min(1, 'Informe a senha').max(200),
})
export type LoginRequest = z.infer<typeof loginRequestSchema>

/** GET /auth/me (e resposta de login/cadastro). */
export const meResponseSchema = z.object({
  id: idSchema,
  username: z.string(),
  displayName: z.string().nullable(),
  onboardingCompleted: z.boolean(),
})
export type MeResponse = z.infer<typeof meResponseSchema>

export const updateProfileRequestSchema = z.object({
  displayName: z.string().trim().max(60, 'Use no máximo 60 caracteres').nullable(),
})
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>
