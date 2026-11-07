# 14 — Ambiente local

Antes de qualquer fase, o ambiente da máquina precisa estar pronto. O Claude Code
deve **verificar cada item abaixo rodando os comandos**, informar o que falta e
como instalar no sistema operacional desta máquina. Não instale nada sem perguntar.

## Obrigatórios

| Ferramenta                 | Versão mínima       | Verificar com                          | Para quê                                                     |
| -------------------------- | ------------------- | -------------------------------------- | ------------------------------------------------------------ |
| Node.js                    | LTS atual (mín. 22) | `node -v`                              | Rodar web, API e scripts                                     |
| pnpm                       | 9+                  | `pnpm -v`                              | Gerenciador do monorepo (instalar com `npm install -g pnpm`) |
| Git                        | 2.40+               | `git --version`                        | Versionamento                                                |
| Docker + Docker Compose v2 | Docker 24+          | `docker -v` e `docker compose version` | Postgres local                                               |
| Docker rodando             | —                   | `docker info`                          | O serviço precisa estar ativo, não só instalado              |

## Portas que precisam estar livres

| Porta | Uso                                                                                                              |
| ----- | ---------------------------------------------------------------------------------------------------------------- |
| 5173  | Front (Vite)                                                                                                     |
| 3333  | API (Express)                                                                                                    |
| 5432  | Postgres (Docker) — se já houver um Postgres instalado na máquina usando essa porta, usar 5433 no docker-compose |

## Arquivos de configuração

- `.env` criado a partir do `.env.example` (o `.env` nunca vai para o Git).
- Em ambiente local, só são necessários: `DATABASE_URL`, `JWT_SECRET`, `REFRESH_TOKEN_PEPPER`,
  `SIGNUP_MODE`, `SIGNUP_INVITE_CODE`, `APP_TIMEZONE`. O `BRAPI_TOKEN` só é necessário a partir da fase da Carteira.

## Instalados pelo próprio projeto (não precisam de instalação manual)

- Dependências: `pnpm install`
- Navegadores do Playwright: `pnpm exec playwright install chromium` (só quando chegar nos testes E2E)
- Prisma CLI: vem como dependência do pacote `db`

## Windows

Recomendado rodar o projeto dentro do **WSL2 (Ubuntu)**, com o Docker Desktop integrado ao WSL.
O repositório deve ficar dentro do sistema de arquivos do Linux (`~/projetos/orla`), não em `C:\`,
por desempenho.

## Script de verificação

Na Fase 0, criar `scripts/doctor.mjs` (Node puro, sem dependências, para funcionar antes do
`pnpm install`) que verifica todos os itens acima e imprime ✅/❌ com a instrução de correção.
Expor também como `pnpm doctor`. Rodar sempre que algo "parar de funcionar do nada".

## Ambiente pronto quando

`node scripts/doctor.mjs` sem nenhum ❌, `pnpm db:up` sobe o Postgres, `pnpm dev` abre o app
em http://localhost:5173 e `pnpm test` passa.
