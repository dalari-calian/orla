# 02 — Arquitetura

## Resumo da decisão

**Monorepo TypeScript ponta a ponta**, com front e API separados logicamente mas publicados no **mesmo projeto Vercel** (mesma origem → sem CORS, cookie de sessão simples), banco **PostgreSQL no Neon** e regras de negócio num pacote puro reutilizável por web, API, futuro app nativo e futuro bot.

```
┌──────────────────────── Vercel (Hobby, grátis) ────────────────────────┐
│  apps/web  (React + Vite, PWA, estático na CDN)   →  https://app/...   │
│  apps/api  (Express, Vercel Function)             →  https://app/api/* │
│  cron diário (/api/jobs/quotes)                                        │
└───────────────────────────────┬────────────────────────────────────────┘
                                │ SQL (driver serverless do Neon)
                     ┌──────────▼──────────┐       ┌──────────────────────┐
                     │ Neon Postgres (Free)│       │ brapi.dev (cotações) │
                     └─────────────────────┘       │ Google News RSS      │
                                                   └──────────────────────┘
```

## Stack

| Camada         | Escolha                                                                                      | Por quê                                                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linguagem      | **TypeScript** (strict) em tudo                                                              | Um idioma só; tipos compartilhados entre web, API, app nativo futuro                                                                                        |
| Monorepo       | **pnpm workspaces + Turborepo**                                                              | Cache de build, `pnpm dev` sobe tudo                                                                                                                        |
| Front          | **React 19 + Vite**                                                                          | SPA rápida, build estático, sem servidor de render pra pagar                                                                                                |
| Roteamento     | **React Router v7** (modo SPA)                                                               | O roteador mais usado do React; loaders, rotas aninhadas, mês na URL via search params                                                                      |
| Dados no front | **TanStack Query**                                                                           | Cache, refetch, updates otimistas                                                                                                                           |
| Formulários    | **React Hook Form + Zod** (schemas de `packages/contracts`)                                  | Mesma validação no front e na API                                                                                                                           |
| UI             | **Tailwind CSS v4 + Radix UI primitives** (via shadcn/ui, customizado)                       | Acessível, sem visual "genérico" depois do tema                                                                                                             |
| Gráficos       | **Recharts** (ou visx se precisar de algo custom)                                            | Simples, responsivo                                                                                                                                         |
| Animação       | **Motion** (framer-motion) — uso moderado                                                    | Transições de sheet, números contando                                                                                                                       |
| PWA            | **vite-plugin-pwa**                                                                          | Instalável no celular, cache do shell                                                                                                                       |
| API            | **Express 5**                                                                                | O framework Node mais usado do mercado; a Vercel faz deploy de app Express como function sem configuração; roda igual em qualquer servidor Node/Docker      |
| ORM            | **Prisma** (+ adapter `@prisma/adapter-neon` em produção)                                    | ORM TypeScript mais adotado; schema declarativo, migrations versionadas (`prisma migrate`), Prisma Studio para ver os dados                                 |
| Banco          | **PostgreSQL 16+** (Neon)                                                                    | Relacional, ACID, `numeric` exato                                                                                                                           |
| Auth           | **bcrypt + JWT (`jsonwebtoken`)** em cookie httpOnly, com refresh token guardado no Postgres | Padrão de mercado, sem biblioteca mágica; o mesmo JWT serve depois como Bearer para o app nativo e o bot. Login Google/e-mail no futuro via **Passport.js** |
| Precisão       | **decimal.js** para quantidade × preço                                                       | É a lib que o Prisma usa para `Decimal` — um tipo só do banco ao cálculo                                                                                    |
| Datas          | **date-fns** + `@date-fns/tz`                                                                | Mês de competência em `America/Sao_Paulo`                                                                                                                   |
| Planilhas      | **SheetJS (xlsx)** + **Papaparse**                                                           | Importar .xlsx e .csv no browser                                                                                                                            |
| Testes         | **Vitest** (core/API), **Playwright** (fluxos críticos e2e)                                  |                                                                                                                                                             |
| Qualidade      | ESLint + Prettier (ou Biome), Husky + lint-staged                                            |                                                                                                                                                             |
| Local          | **Docker Compose** com Postgres 16                                                           | Dev sem depender da nuvem                                                                                                                                   |

## Estrutura do repositório

```
orla/
├─ CLAUDE.md
├─ docs/                       # esta especificação
├─ apps/
│  ├─ web/                     # React + Vite (PWA)
│  │  └─ src/
│  │     ├─ routes/            # React Router (rotas declaradas em routes.tsx)
│  │     ├─ features/          # finance/, portfolio/, contribution/, balance/, settings/, import/
│  │     │   └─ <feature>/{components,hooks,api.ts}
│  │     ├─ components/ui/     # design system (Button, Sheet, Card, MoneyInput...)
│  │     ├─ lib/               # http client, formatters, query client
│  │     └─ styles/            # tokens.css, globals.css
│  └─ api/                     # Express
│     └─ src/
│        ├─ index.ts           # app Express (export default para Vercel; app.listen() em dev/Docker)
│        ├─ routes/            # 1 arquivo por recurso
│        ├─ services/          # orquestram core + db
│        ├─ integrations/      # brapi.ts, news.ts (atrás de interfaces)
│        ├─ jobs/              # quotes.ts (cron)
│        └─ middleware/        # auth, error handler, rate limit
├─ packages/
│  ├─ core/                    # REGRAS DE NEGÓCIO PURAS (sem I/O)
│  │  └─ src/{money,dates,finance,portfolio,contribution,balance,import}
│  ├─ contracts/               # schemas Zod (DTOs) compartilhados
│  ├─ db/                      # schema.prisma, migrations, seed, PrismaClient
│  └─ config/                  # tsconfig, eslint, tailwind preset
├─ docker-compose.yml
├─ turbo.json
└─ vercel.json
```

**Regra de dependência:** `web → contracts, core` · `api → contracts, core, db` · `core → nada` · `db → nada de domínio`. O futuro app Expo importa `core` e `contracts` como o web.

## Hospedagem gratuita

| Serviço             | Uso                                       | Limites relevantes (conferir antes do deploy)                                                                                                                                          |
| ------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vercel Hobby**    | Front estático + API como function + cron | Cron no Hobby só pode rodar **no máximo 1×/dia**, com precisão de ±59 min. Uso pessoal/não comercial.                                                                                  |
| **Neon Free**       | Postgres                                  | 0,5 GB de storage por projeto e 100 CU-hours/mês; compute dorme após 5 min ocioso e volta em poucas centenas de ms. Restore point-in-time limitado (~6h) → **fazemos backup próprio**. |
| **GitHub**          | Repo + Actions                            | Backup semanal do banco (`pg_dump` → artefato/branch privada) e, se quiser, cron mais frequente de cotação chamando `/api/jobs/quotes` com segredo.                                    |
| **brapi.dev Free**  | Cotações B3                               | 15.000 req/mês, **1 ticker por requisição**, delay ~30 min, sem dados de dividendos no plano gratuito.                                                                                 |
| **Google News RSS** | Notícias por ativo                        | Sem chave; cache obrigatório.                                                                                                                                                          |

### Por que Neon e não Supabase

O Supabase Free **pausa o projeto após ~7 dias de baixa atividade** e exige reativar manualmente; para um app pessoal que pode ficar uma semana sem uso (férias), isso é um risco. O Neon só suspende o compute e acorda sozinho na próxima query. Como usamos Prisma + Postgres padrão, trocar de provedor é trocar a `DATABASE_URL`.

### Por que não Render/Railway para a API

O free do Render "dorme" e leva dezenas de segundos para acordar — péssimo no celular. Function na Vercel acorda em ~centenas de ms. Se um dia precisar de processo contínuo (bot WhatsApp com websocket), aí sim sobe um serviço separado (Fly.io/Railway/VPS) — a API Express roda igual em qualquer servidor Node.

## Autenticação (v1)

- Cadastro: `username` (3–30, `[a-z0-9_.]`, único, case-insensitive) + senha (mín. 8). Sem e-mail.
- Senha com **bcrypt** (custo 12).
- **Access token** JWT (15 min) + **refresh token** opaco (30 dias, hash guardado na tabela `sessions`, rotacionado a cada uso), ambos em cookie `httpOnly; Secure; SameSite=Lax`. Logout = revoga o refresh token.
- App nativo/bot no futuro: mesmos tokens via header `Authorization: Bearer`.
- **Cadastro controlado por convite:** variável `SIGNUP_MODE=invite|open|closed`. Na v1 use `invite` com código definido em env (`SIGNUP_INVITE_CODE`) para ninguém aleatório criar conta no seu domínio público.
- Rate limit em login (5 tentativas/min por IP+username).
- Futuro (sem migração): e-mail + recuperação de senha, login Google, passkeys, 2FA.

## Ambientes e variáveis

```
DATABASE_URL=            # Neon (prod) / postgres://localhost (dev)
JWT_SECRET=
REFRESH_TOKEN_PEPPER=
SIGNUP_MODE=invite
SIGNUP_INVITE_CODE=
BRAPI_TOKEN=
CRON_SECRET=             # protege /api/jobs/*
APP_TIMEZONE=America/Sao_Paulo
```

- `main` → produção. PRs → preview da Vercel apontando para um **branch do Neon** (o free permite branches).

## ADRs (registro de decisões)

1. **SPA + API separada em vez de Next.js full-stack:** a API precisa servir o app nativo e o bot futuros; Express é o padrão do mercado e roda em qualquer lugar; SPA estática não consome function.
2. **Dinheiro em centavos inteiros** e quantidades em `numeric(20,8)`.
3. **Regras no `packages/core` puro**, testável sem banco.
4. **Provedores externos atrás de interfaces** (`QuoteProvider`, `NewsProvider`) — trocar brapi por outra fonte não toca regra de negócio.
5. **Neon em vez de Supabase** (sem pausa por inatividade).
6. **Valores calculados não são persistidos** quando podem ser derivados (preço médio, saldo de parcelamento, sobra do mês) — exceção: balanço mensal, que é um _snapshot_ congelado de propósito.
7. **Versões fixadas na Fase 0 (nov/2026):** TypeScript **6.0** (o `typescript-eslint` ainda não suporta o TS 7), Prisma **7.10** (o "latest" do npm era um RC do 8), React Router **7** (o que este doc define), Vite 8, Vitest 5, Tailwind 4.3, Express 5. Versões comuns ficam no `catalog:` do `pnpm-workspace.yaml`.
8. **Prisma 7 usa driver adapter:** `@prisma/adapter-pg` em todo lugar por enquanto (local e testes); o `@prisma/adapter-neon` entra quando houver deploy. Config em `packages/db/prisma.config.ts`; o client é gerado em `packages/db/src/generated` (fora do Git).
9. **Pacotes internos exportam TypeScript direto** (`exports: ./src/index.ts`): sem etapa de build entre pacotes; a API roda com `tsx` e o web com Vite.
10. **Postgres local na porta 5433** (`POSTGRES_PORT` no `.env`) para conviver com outro Postgres na 5432.
11. **Deploy na Vercel adiado:** por decisão do dono, a validação é feita rodando local; o deploy entra quando ele pedir.
