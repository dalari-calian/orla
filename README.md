# Orla

Controle financeiro pessoal + carteira de investimentos. Web, mobile-first.
A especificação completa está em [`docs/`](docs/00-INDICE.md).

## Rodando na sua máquina

Pré-requisitos: Node 22+, pnpm 9+, Git e Docker Desktop **aberto**. Para conferir:

```bash
node scripts/doctor.mjs
```

**Atalho:** com o Docker Desktop aberto, `pnpm start` faz tudo de uma vez (cria o `.env` se faltar,
instala, sobe o banco, aplica migrations, roda o seed e sobe web + API). Serve para a primeira vez e
para o dia a dia.

Passo a passo, se preferir:

```bash
pnpm install                         # dependências
cp .env.example .env                 # PowerShell: Copy-Item .env.example .env
pnpm db:up                           # sobe o Postgres (Docker, porta 5433)
pnpm db:migrate                      # cria as tabelas
pnpm db:seed                         # usuário de exemplo: demo / orla1234
pnpm dev                             # web + API
```

Abra **http://localhost:5173** e entre com `demo` / `orla1234`, ou crie uma conta usando o
código de convite que está em `SIGNUP_INVITE_CODE` no `.env`. A API responde em http://localhost:3333/api/v1/health
(e também pelo front, em http://localhost:5173/api/v1/health).

No dia a dia, basta abrir o Docker Desktop e rodar `pnpm start` (ou `pnpm db:up` e depois `pnpm dev`).

## Comandos

| Comando               | O que faz                                              |
| --------------------- | ------------------------------------------------------ |
| `pnpm start`          | Prepara tudo (install, banco, migrations, seed) e sobe |
| `pnpm dev`            | Sobe web (5173) e API (3333) com recarga automática    |
| `pnpm test`           | Testes (Vitest) de todos os pacotes                    |
| `pnpm lint`           | ESLint                                                 |
| `pnpm typecheck`      | TypeScript em todos os pacotes                         |
| `pnpm build`          | Build de produção do front                             |
| `pnpm format`         | Formata o código com Prettier                          |
| `pnpm doctor`         | Verifica o ambiente                                    |
| `pnpm db:up`          | Sobe o Postgres local                                  |
| `pnpm db:down`        | Para o Postgres (os dados continuam no volume Docker)  |
| `pnpm db:migrate`     | Aplica as migrations                                   |
| `pnpm db:migrate:dev` | Cria uma migration nova a partir do `schema.prisma`    |
| `pnpm db:seed`        | Dados de exemplo                                       |
| `pnpm db:studio`      | Prisma Studio (ver/editar dados no navegador)          |

### App instalável (PWA)

O service worker só existe no build de produção (no `pnpm dev` ele fica desligado para não atrapalhar a recarga). Para testar a instalação, com a API rodando: `pnpm build` e depois `pnpm --filter @orla/web preview` — no Chrome/Edge aparece o ícone de instalar na barra de endereço. No celular, a instalação exige HTTPS (ou seja, o deploy).

## Estrutura

```
apps/web            React 19 + Vite + Tailwind v4 (front)
apps/api            Express 5 (API em /api/v1)
packages/core       Regras de negócio puras + testes (dinheiro, datas, cálculos)
packages/contracts  Schemas Zod compartilhados entre web e API
packages/db         Prisma (schema, migrations, seed)
packages/config     tsconfig e ESLint compartilhados
```
