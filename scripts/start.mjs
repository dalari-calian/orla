// `pnpm start` — prepara tudo e sobe o projeto com um único comando:
// .env (se faltar) → dependências → Prisma Client → Postgres → migrations → seed → web + API.
// Pode rodar todo dia: cada passo é idempotente e rápido quando não há nada novo.
import { execSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function run(label, command) {
  console.info(`\n▶ ${label}`)
  try {
    execSync(command, { cwd: root, stdio: 'inherit' })
  } catch {
    console.error(`\nErro: Falhou em: ${label}`)
    process.exit(1)
  }
}

if (!existsSync(join(root, '.env'))) {
  copyFileSync(join(root, '.env.example'), join(root, '.env'))
  console.info('▶ .env criado a partir do .env.example')
}

try {
  execSync('docker info', { cwd: root, stdio: 'ignore' })
} catch {
  console.error(
    '\nErro: O Docker não está rodando. Abra o Docker Desktop, espere iniciar e rode de novo.',
  )
  process.exit(1)
}

run('Instalando dependências', 'pnpm install')
// O client do Prisma fica em src/generated (gitignored): num clone novo ele não existe
// e o seed quebra antes do `pnpm dev` (que gera via turbo) ter chance de rodar.
run('Gerando o Prisma Client', 'pnpm db:generate')
run('Subindo o Postgres', 'pnpm db:up')
run('Aplicando migrations', 'pnpm db:migrate')
run('Dados de exemplo (demo / orla1234)', 'pnpm db:seed')
run('Subindo web (http://localhost:5173) e API (http://localhost:3333)', 'pnpm dev')
