import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Banco dos testes de API (RNF-42: Postgres real). Usa DATABASE_URL_TEST se existir;
 * senão, o mesmo servidor da DATABASE_URL com o banco `orla_test` — nunca o banco de dev.
 */
export function testDatabaseUrl(): string {
  const envPath = fileURLToPath(new URL('../../../../.env', import.meta.url))
  if (existsSync(envPath)) process.loadEnvFile(envPath)

  if (process.env.DATABASE_URL_TEST) return process.env.DATABASE_URL_TEST
  const base = process.env.DATABASE_URL
  if (!base)
    throw new Error('Defina DATABASE_URL (ou DATABASE_URL_TEST) para rodar os testes da API.')
  const url = new URL(base)
  url.pathname = '/orla_test'
  return url.toString()
}
