# 13 — Roadmap de implementação

- **Primeiro passo:** verificar o ambiente conforme `docs/14-ambiente-local.md`. Se faltar algo,
  parar e me informar o que instalar antes de continuar. Criar `scripts/doctor.mjs`.

Implementar **uma fase por vez**. Em cada fase: plano → implementação → testes → deploy de preview → validação manual pelo dono.

ATENÇÃO: Os testes eu vou fazendo de forma manual, então pode desconiderar a parte de fazer o debloy web e etc, primeiro vou testando as alterações rodando a aplicação local mesmo.

## Fase 0 — Fundação (1 sessão)

- Monorepo pnpm + Turborepo, `apps/web`, `apps/api`, `packages/{core,contracts,db,config}`.
- TS strict, ESLint/Prettier, Vitest, Husky, CI no GitHub Actions.
- Docker Compose com Postgres 16; Prisma configurado; migration inicial; seed.
- Express com `/api/v1/health`; Vite com proxy `/api` → API local; deploy na Vercel (web estático + function) apontando para Neon.
- Design tokens, `AppShell` (tab bar mobile / sidebar desktop), tema claro/escuro, páginas placeholder de todas as rotas.
- `packages/core/money` (centavos, decimal.js, formatação BRL, parse pt-BR) **com testes**.
  **Aceite:** `pnpm dev` sobe tudo; URL pública da Vercel abre o shell no celular; CI verde.

## Fase 1 — Auth e configurações básicas

- Auth username+senha (bcrypt + JWT/refresh em cookie), cadastro por convite, middleware que injeta `req.userId`.
- CRUD de contas, cartões, categorias (com padrões no cadastro), estabelecimentos.
- Onboarding (passos 1–4 do doc 10).
  **Aceite:** dois usuários diferentes não enxergam dados um do outro (teste automatizado).

## Fase 2 — Finanças núcleo

- Transações (CRUD, status, filtros), mês de competência, `MonthSwitcher`.
- Recurring templates (salário base, fixas, anual) com materialização e override (RF-10..15, RF-23).
- Regra de fatura (RF-30) e tela de fatura.
- Parcelamentos completos (RF-40..48) + totalizador de quitação.
- Planejamentos (RF-21/22).
- Meta de investimento e resumo do mês (RF-50/51).
- Sheet de lançamento rápido (RM-01..04).
  **Aceite:** dá para reproduzir o mês atual da planilha financeira inteiro no app e os totais batem.

## Fase 3 — Dashboard financeiro + projeção

- Doc 04 §8 completo, projeção 12 meses, orçamento por categoria, tela Início (parte financeira).
- PWA instalável.

## Fase 4 — Importação/exportação (financeiro)

- Wizard de importação para Lançamentos e Parcelamentos, templates .xlsx, duplicados, desfazer.
- Exportar CSV/XLSX e backup JSON.
  **Aceite:** histórico da planilha atual importado.

## Fase 5 — Carteira

- Classes, metas de alocação, ativos (bolsa e renda fixa), operações, posição e PM (RC-20..), proventos (incl. lançamento em lote).
- `QuoteProvider` brapi + cache + cron diário.
- Telas Carteira e Detalhe do ativo (sem notícias).
- Importação de ativos, operações e proventos.

## Fase 6 — Aporte

- Simulador completo (doc 06), sugestão de rebalanceamento, rascunho, efetivação.

## Fase 7 — Balanço e rentabilidade

- Balanço pré-preenchido, fechar/reabrir, rentabilidade real mensal/anual/TWR, projeção do ano, preços observados.
- Importação de balanços históricos.
- Dashboard da Carteira completo + parte de patrimônio na Início.
  **Aceite:** os números de rentabilidade dos últimos meses batem com a planilha de balanço.

## Fase 8 — Notícias e polimento

- `NewsProvider` (Google News RSS) + cache, aba Notícias e feed.
- Ocultar valores, animações, acessibilidade, E2E dos 7 fluxos, backup automático semanal.

## Futuro

- Quick-entry por texto no app → bot de WhatsApp.
- Offline com fila de sincronização.
- Benchmarks (CDI/IPCA/IBOV).
- Ativos em USD com câmbio.
- App nativo Expo.
- Login com e-mail/Google, 2FA.
