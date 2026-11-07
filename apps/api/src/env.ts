import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3333),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  APP_TIMEZONE: z.string().default('America/Sao_Paulo'),
  /** Origem do front, usada na checagem de CSRF (RNF-20). */
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa ter pelo menos 32 caracteres'),
  REFRESH_TOKEN_PEPPER: z
    .string()
    .min(32, 'REFRESH_TOKEN_PEPPER precisa ter pelo menos 32 caracteres'),
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
  if (parsed.data.SIGNUP_MODE === 'invite' && !parsed.data.SIGNUP_INVITE_CODE) {
    throw new Error('SIGNUP_MODE=invite exige SIGNUP_INVITE_CODE no .env')
  }
  return parsed.data
}
