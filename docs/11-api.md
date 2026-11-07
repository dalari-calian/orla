# 11 — API

REST JSON sob `/api`, Express 5 (camadas: `routes` → `controllers` → `services` → Prisma; validação com Zod em middleware). Autenticação por cookie de sessão (web) e, no futuro, `Authorization: Bearer <token>` (app nativo/bot). Todos os schemas em `packages/contracts`.

## Convenções

- Valores monetários: inteiros em centavos (`amountCents`); quantidades/preços: **string** decimal (`"4.00000000"`) para não perder precisão no JSON.
- Datas `YYYY-MM-DD`; mês `YYYY-MM`.
- Listas: `?cursor=&limit=` (máx. 200). Resposta `{ data: [], nextCursor }`.
- Erros: `{ error: { code, message, details? } }` — códigos `VALIDATION`, `NOT_FOUND`, `CONFLICT`, `UNAUTHORIZED`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`.
- Escritas aceitam header `Idempotency-Key` (importante para o bot e para reenvio no celular).
- `DELETE` = soft delete. `POST /:id/restore` desfaz.
- Versionamento: prefixo `/api/v1` desde o início.

## Endpoints

### Sistema

`GET /health` (público, sem `user_id`) — schema `healthResponseSchema` em `packages/contracts`.
Resposta `200` quando o banco responde e `503` quando não responde (timeout de 2 s), sempre com o mesmo corpo:
`{ status: 'ok' | 'degraded', version, time (ISO), timezone, database: 'up' | 'down' }`, `Cache-Control: no-store`.
Erro inesperado em qualquer rota → `500 { error: { code: 'INTERNAL', message } }`.

### Auth

`POST /auth/register` (username, senha, código de convite) · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me`

Implementado na Fase 1 (schemas em `packages/contracts/src/auth.ts`):

| método | rota | sessão | notas |
| --- | --- | --- | --- |
| GET | `/auth/config` | pública | `{ signupMode: 'invite' \| 'open' \| 'closed' }` — a tela de cadastro decide se pede convite |
| POST | `/auth/register` | pública | `{ username, password, displayName?, inviteCode? }` → `201` + `MeResponse` e cookies. Cria `user_settings` e as categorias padrão (RF-60). `403` convite inválido/cadastro fechado · `409` usuário já existe · rate limit 5/min por IP |
| POST | `/auth/login` | pública | `{ username, password }` → `MeResponse` e cookies. `401` com mensagem única para usuário inexistente ou senha errada · `429` após 5 tentativas/min por IP+usuário |
| POST | `/auth/refresh` | cookie `orla_rt` | Rotaciona o refresh token. Reuso de um token já rotacionado (fora de uma janela de 10 s) revoga **todas** as sessões do usuário. Falha → `401` e limpa os cookies |
| POST | `/auth/logout` | — | Revoga o refresh token, limpa os cookies, `204` |
| GET/PATCH | `/auth/me` | sim | `MeResponse = { id, username, displayName, onboardingCompleted }`; `PATCH { displayName }` |

- Cookies `httpOnly; SameSite=Lax` (`Secure` em produção): `orla_at` = JWT HS256 de 15 min (path `/`), `orla_rt` = refresh opaco de 30 dias (path `/api/v1/auth`, guardado só como HMAC-SHA256 com `REFRESH_TOKEN_PEPPER`).
- Também aceita `Authorization: Bearer <access token>` (app nativo/bot).
- Toda rota de dados exige sessão; sem sessão → `401`, inclusive para rotas inexistentes (não revela o que existe).
- Escritas com header `Origin` diferente de `APP_ORIGIN` → `403` (CSRF, RNF-20).

### Configuração

| método    | rota                                                      |                                                     |
| --------- | --------------------------------------------------------- | --------------------------------------------------- |
| GET/PATCH | `/me/settings`                                            | meta padrão, tema, regras de fatura e rentabilidade |
| CRUD      | `/accounts` · `/credit-cards` · `/categories` · `/payees` |                                                     |
| CRUD      | `/recurring-templates`                                    | `PATCH` aceita `applyFromMonth`                     |
| CRUD      | `/asset-classes` · `/target-allocations` (PUT em lote)    |                                                     |

Implementado na Fase 1 (schemas em `packages/contracts/src/registrations.ts` e `settings.ts`):

- **CRUD** = `GET /x` (lista `{ data, nextCursor: null }`) · `GET /x/:id` · `POST /x` (`201`) · `PATCH /x/:id` · `DELETE /x/:id` (soft delete, `204`) · `POST /x/:id/restore`.
- Registro de outro usuário, excluído ou com ID malformado → `404`. Referência a registro de outro usuário (ex.: `accountId` do cartão) → `400 VALIDATION` com `details.fields`.
- `/accounts`: `{ name, kind: checking|savings|brokerage|wallet|other, color }`; `PATCH` aceita `isArchived`. Nome único por usuário sem diferenciar maiúsculas (`409`). Não exclui conta com cartão ativo (`409`).
- `/credit-cards`: `{ accountId, name, closingDay 1–31, dueDay 1–31, limitCents? }`.
- `/categories`: `{ kind, name, parentId?, icon (catálogo do core), color, monthlyBudgetCents? }`; `GET ?kind=income|expense`. Só 1 nível de subcategoria, pai do mesmo tipo; `kind` não muda depois de criada. Nome único dentro do mesmo pai. Não exclui categoria com subcategorias (`409`); restore exige o pai ativo.
- `/payees`: `{ name, defaultCategoryId? }`; `GET ?q=` busca por nome. Nome único sem diferenciar maiúsculas.
- `/me/settings`: `GET` e `PATCH { savingsGoal?, cardCompetence?, theme?, hideValues?, onboardingCompleted? }`, com `savingsGoal = { mode: 'none' } | { mode: 'fixed', amountCents } | { mode: 'percent', percent: "20.5" }`.
- `/recurring-templates` (subconjunto da Fase 1): `GET` e `POST { description, amountCents, dayOfMonth, startMonth: 'YYYY-MM', categoryId?, accountId? }`, que cria **receita fixa mensal** (salário base do onboarding). Editar, excluir e materializar nos meses vêm na Fase 2.

### Finanças

| método | rota                                      |                                                                               |
| ------ | ----------------------------------------- | ----------------------------------------------------------------------------- |
| GET    | `/months/:month`                          | materializa templates (RF-11) e retorna `{ summary, transactions, settings }` |
| PATCH  | `/months/:month/settings`                 | meta do mês                                                                   |
| GET    | `/months/:month/dashboard`                | agregados do doc 04 §8                                                        |
| GET    | `/projection?from=&months=12`             | RF-52                                                                         |
| CRUD   | `/transactions`                           | filtros: `month, type, nature, status, categoryId, cardId, accountId, q`      |
| POST   | `/transactions/bulk`                      | edição em lote                                                                |
| POST   | `/transactions/:id/settle` · `/unsettle`  |                                                                               |
| CRUD   | `/installment-plans`                      | `POST` gera parcelas; `GET` retorna indicadores derivados                     |
| POST   | `/installment-plans/:id/payoff`           | quitação antecipada                                                           |
| GET    | `/installment-plans/summary`              | totalizador de quitação + compromisso mensal                                  |
| GET    | `/credit-cards/:id/statements/:month`     | fatura                                                                        |
| POST   | `/credit-cards/:id/statements/:month/pay` |                                                                               |
| POST   | `/quick-entry`                            | texto livre → rascunho (RQ-01)                                                |

### Carteira

| método | rota                                   |                                                |
| ------ | -------------------------------------- | ---------------------------------------------- |
| GET    | `/portfolio`                           | posição completa com cotações (`?groupBy=class | account | ticker`) |
| GET    | `/portfolio/dashboard`                 |                                                |
| CRUD   | `/assets`                              |                                                |
| GET    | `/assets/:id`                          | detalhe + posição + indicadores                |
| CRUD   | `/asset-trades`                        |                                                |
| CRUD   | `/dividends` · `POST /dividends/batch` |                                                |
| GET    | `/assets/:id/news`                     |                                                |
| GET    | `/news`                                | feed da carteira                               |
| GET    | `/quotes?tickers=`                     | do cache; atualiza vencidos em background      |
| GET    | `/tickers/search?q=`                   | autocomplete via provedor                      |

### Aporte

| método | rota                                    |                            |
| ------ | --------------------------------------- | -------------------------- |
| CRUD   | `/contribution-plans` (itens embutidos) |                            |
| POST   | `/contribution-plans/:id/execute`       | cria trades + contribution |
| CRUD   | `/contributions`                        |                            |

### Balanço

| método | rota                                 |                                |
| ------ | ------------------------------------ | ------------------------------ |
| GET    | `/balances`                          | lista com indicadores          |
| GET    | `/balances/:month/draft`             | pré-preenchido (RB-02)         |
| PUT    | `/balances/:month`                   | salva rascunho                 |
| POST   | `/balances/:month/close` · `/reopen` |                                |
| GET    | `/returns?year=`                     | rentabilidade real (doc 07 §3) |
| GET    | `/price-observations`                | RB-30                          |

### Importação / exportação

| método | rota                            |                                                 |
| ------ | ------------------------------- | ----------------------------------------------- |
| POST   | `/imports`                      | cria job com mapping                            |
| POST   | `/imports/:id/rows`             | lote de até 500 linhas já parseadas → validação |
| POST   | `/imports/:id/commit` · `/undo` |                                                 |
| GET    | `/imports`                      | histórico                                       |
| GET    | `/exports/:entity?format=csv    | xlsx&from=&to=`                                 |     |
| GET    | `/backup` · `POST /restore`     | JSON completo                                   |

### Jobs (protegidos por `CRON_SECRET`)

`GET /jobs/quotes` (diário) · `GET /jobs/keepalive` (opcional)
