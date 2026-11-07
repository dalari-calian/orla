import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Carrega o .env da raiz do monorepo (se existir) sem sobrescrever variáveis já definidas. */
export function loadRootEnv(): void {
  const envPath = fileURLToPath(new URL('../../../.env', import.meta.url))
  if (existsSync(envPath)) process.loadEnvFile(envPath)
}
