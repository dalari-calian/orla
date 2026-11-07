import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3333),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  APP_TIMEZONE: z.string().default('America/Sao_Paulo'),
  // Auth — obrigatórios a partir da Fase 1.
  JWT_SECRET: z.string().optional(),
  REFRESH_TOKEN_PEPPER: z.string().optional(),
  SIGNUP_MODE: z.enum(['invite', 'open', 'closed']).default('invite'),
  SIGNUP_INVITE_CODE: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

/** Lê o .env da raiz (em dev) e valida as variáveis. Falha cedo com mensagem clara. */
export function loadEnv(): Env {
  const envPath = fileURLToPath(new URL('../../../.env', import.meta.url))
  if (existsSync(envPath)) process.loadEnvFile(envPath)

  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
    )
    throw new Error(`Variáveis de ambiente inválidas:\n${issues.join('\n')}`)
  }
  return parsed.data
}
