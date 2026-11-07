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

### Configuração

| método    | rota                                                      |                                                     |
| --------- | --------------------------------------------------------- | --------------------------------------------------- |
| GET/PATCH | `/me/settings`                                            | meta padrão, tema, regras de fatura e rentabilidade |
| CRUD      | `/accounts` · `/credit-cards` · `/categories` · `/payees` |                                                     |
| CRUD      | `/recurring-templates`                                    | `PATCH` aceita `applyFromMonth`                     |
| CRUD      | `/asset-classes` · `/target-allocations` (PUT em lote)    |                                                     |

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
