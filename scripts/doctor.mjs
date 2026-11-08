#!/usr/bin/env node
// Verifica se a máquina tem tudo para rodar o Orla (docs/14-ambiente-local.md).
// Node puro, sem dependências: funciona antes do `pnpm install`.
// Uso: node scripts/doctor.mjs   (ou: pnpm doctor)

import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import net from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const platform = process.platform // win32 | darwin | linux
const isWindows = platform === 'win32'

const results = []
const ok = (label, detail = '') => results.push({ icon: '[ ok ]', label, detail })
const fail = (label, detail, fix) =>
  results.push({ icon: '[erro]', label, detail, fix, failed: true })
const warn = (label, detail, fix) => results.push({ icon: '[aviso]', label, detail, fix })

/** Roda um comando fixo deste script (nunca entrada do usuário) e devolve a saída, ou null. */
function run(command, args) {
  const options = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000 }
  try {
    // No Windows, pnpm/docker podem ser .cmd e precisam do shell; os argumentos são
    // constantes, então montamos a linha inteira (evita o aviso DEP0190 do Node).
    const output = isWindows
      ? execSync([command, ...args.map((arg) => `"${arg}"`)].join(' '), options)
      : execFileSync(command, args, options)
    return output.trim()
  } catch {
    return null
  }
}

/** Extrai "x.y.z" de uma saída qualquer e compara com o mínimo. */
function parseVersion(text) {
  const match = text?.match(/(\d+)\.(\d+)(?:\.(\d+))?/)
  return match ? match.slice(1, 4).map((part) => Number(part ?? 0)) : null
}
function atLeast(version, minimum) {
  for (let i = 0; i < minimum.length; i++) {
    if ((version[i] ?? 0) > minimum[i]) return true
    if ((version[i] ?? 0) < minimum[i]) return false
  }
  return true
}

const install = {
  node: {
    win32: 'winget install OpenJS.NodeJS.LTS   (depois feche e abra o terminal)',
    darwin: 'brew install node@22   ou   https://nodejs.org',
    linux: 'use o fnm/nvm: curl -fsSL https://fnm.vercel.app/install | bash && fnm install 22',
  },
  git: {
    win32: 'winget install Git.Git',
    darwin: 'xcode-select --install   ou   brew install git',
    linux: 'sudo apt install git',
  },
  docker: {
    win32: 'winget install Docker.DockerDesktop',
    darwin: 'brew install --cask docker',
    linux: 'https://docs.docker.com/engine/install/',
  },
}
const howTo = (tool) => install[tool][platform] ?? install[tool].linux

function checkTool({ name, command, args, minimum, fix }) {
  const output = run(command, args)
  const version = parseVersion(output)
  if (!output || !version) return fail(name, 'não encontrado', fix)
  const shown = version.join('.')
  if (!atLeast(version, minimum)) {
    return fail(name, `${shown} (mínimo ${minimum.join('.')})`, fix)
  }
  ok(name, shown)
}

// ── Ferramentas ────────────────────────────────────────────────────────────
const nodeVersion = parseVersion(process.versions.node)
if (atLeast(nodeVersion, [22, 12])) ok('Node.js', process.versions.node)
else fail('Node.js', `${process.versions.node} (mínimo 22.12)`, howTo('node'))

checkTool({
  name: 'pnpm',
  command: 'pnpm',
  args: ['-v'],
  minimum: [9],
  fix: 'npm install -g pnpm   (depois feche e abra o terminal)',
})
checkTool({
  name: 'Git',
  command: 'git',
  args: ['--version'],
  minimum: [2, 40],
  fix: howTo('git'),
})
checkTool({
  name: 'Docker',
  command: 'docker',
  args: ['-v'],
  minimum: [24],
  fix: howTo('docker'),
})
checkTool({
  name: 'Docker Compose v2',
  command: 'docker',
  args: ['compose', 'version'],
  minimum: [2],
  fix: 'atualize o Docker Desktop (o Compose v2 vem junto)',
})

const dockerRunning = run('docker', ['info', '--format', '{{.ServerVersion}}']) !== null
if (dockerRunning) ok('Docker rodando')
else {
  fail(
    'Docker rodando',
    'o serviço do Docker não respondeu',
    isWindows || platform === 'darwin'
      ? 'abra o Docker Desktop e espere "Engine running"'
      : 'sudo systemctl start docker',
  )
}

// ── .env ───────────────────────────────────────────────────────────────────
const env = {}
const envPath = join(root, '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (match) env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'REFRESH_TOKEN_PEPPER',
    'SIGNUP_MODE',
    'SIGNUP_INVITE_CODE',
    'APP_TIMEZONE',
  ]
  const missing = required.filter((key) => !env[key])
  if (missing.length === 0) ok('.env', 'todas as variáveis obrigatórias presentes')
  else fail('.env', `faltando: ${missing.join(', ')}`, 'compare com o .env.example')
  if (/troque-por/.test(`${env.JWT_SECRET}${env.REFRESH_TOKEN_PEPPER}`)) {
    warn(
      'Segredos do .env',
      'JWT_SECRET/REFRESH_TOKEN_PEPPER ainda com o valor de exemplo',
      'gere valores aleatórios longos',
    )
  }
} else {
  fail(
    '.env',
    'arquivo não existe',
    isWindows ? 'Copy-Item .env.example .env   (PowerShell)' : 'cp .env.example .env',
  )
}

// ── Portas ─────────────────────────────────────────────────────────────────
/** true se já existe algo escutando na porta (tenta conectar em localhost). */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    const done = (inUse) => {
      socket.destroy()
      resolve(inUse)
    }
    socket.setTimeout(700, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
}

const dbPort = Number(env.POSTGRES_PORT ?? 5433)
const apiPort = Number(env.API_PORT ?? 3333)
const orlaDbPorts = dockerRunning
  ? run('docker', ['ps', '--filter', 'name=^orla-postgres$', '--format', '{{.Ports}}'])
  : null

const ports = [
  { port: 5173, use: 'Front (Vite)' },
  { port: apiPort, use: 'API (Express)' },
  { port: dbPort, use: 'Postgres (Docker)', isDb: true },
]
for (const { port, use, isDb } of ports) {
  const inUse = await isPortInUse(port)
  const label = `Porta ${port} — ${use}`
  if (!inUse) ok(label, 'livre')
  else if (isDb && orlaDbPorts?.includes(`:${port}->`))
    ok(label, 'em uso pelo próprio Postgres do Orla')
  else if (isDb) {
    fail(
      label,
      'ocupada por outro programa',
      `mude POSTGRES_PORT e a porta da DATABASE_URL no .env (ex.: ${port + 1})`,
    )
  } else {
    fail(
      label,
      'ocupada',
      'se for o próprio Orla rodando (pnpm dev), pode ignorar; senão feche o programa que usa a porta',
    )
  }
}

// ── Saída ──────────────────────────────────────────────────────────────────
console.log('\nOrla — verificação do ambiente\n')
const width = Math.max(...results.map((result) => result.label.length))
for (const { icon, label, detail, fix } of results) {
  console.log(`${icon} ${label.padEnd(width)}  ${detail ?? ''}`)
  if (fix) console.log(`   ${' '.repeat(width)}  → ${fix}`)
}

const failures = results.filter((result) => result.failed).length
console.log(
  failures === 0
    ? '\nTudo pronto. Próximos passos: pnpm db:up → pnpm db:migrate → pnpm dev\n'
    : `\n${failures} item(ns) para resolver antes de rodar o projeto.\n`,
)
process.exit(failures === 0 ? 0 : 1)
