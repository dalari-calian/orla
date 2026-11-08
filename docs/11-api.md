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
- `/recurring-templates` (CRUD completo na Fase 2): `{ type, nature: fixed|planned, description, amountCents, categoryId?, accountId?, payeeId?, paymentMethod?, creditCardId?, frequency: monthly|yearly, monthOfYear? (1–12, obrigatório no anual), dayOfMonth, startMonth, endMonth?, isActive? }`.
  - `PATCH` aceita `applyFromMonth` (padrão: mês atual). RF-13: muda só os lançamentos **previstos e não editados à mão** com competência ≥ esse mês. Se o modelo deixou de ocorrer num mês (fim, pausa, outro mês do ano), o previsto daquele mês sai.
  - `DELETE ?removeFromMonth=YYYY-MM` (RF-14) também remove os previstos desse mês em diante. `restore` traz de volta o modelo e os lançamentos removidos junto.

### Finanças

| método | rota                                      |                                                                               |
| ------ | ----------------------------------------- | ----------------------------------------------------------------------------- |
| GET    | `/months/:month`                          | materializa templates (RF-11) e retorna `{ summary, transactions, settings }` |
| PATCH  | `/months/:month/settings`                 | meta do mês e quanto já foi investido                                         |
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

Implementado na Fase 2 (schemas em `packages/contracts/src/finances.ts`; regras em `packages/core/src/finance`):

- **Mês**
  - `GET /months/:month` materializa os modelos ativos (RF-11, idempotente) e devolve `{ month, summary, settings: { savingsGoalCents, goalInvestedCents, defaultSavingsGoal, notes }, transactions }`. `summary` segue a RF-51.
  - `PATCH /months/:month/settings { savingsGoalCents?: number | null, goalInvestedCents?: number | null, notes? }` define a meta do mês (`null` volta à meta padrão) e quanto dela já foi investido (`null` = nada; sai do saldo do mês).
  - Mês malformado → `404`. Dashboard e projeção: ver Fase 3 abaixo.
- **Lançamentos**
  - Rotas: `GET /transactions?month&type&nature&status&categoryId&cardId&accountId&payeeId&q&cursor&limit` (ordem: data desc; `nextCursor` = id do último) · `GET/PATCH/DELETE /transactions/:id` · `POST /transactions` · `POST /transactions/:id/settle { amountCents?, date? }` · `/unsettle` · `/restore`.
  - Criar: `{ type, nature: fixed|variable|planned|extra, description, amountCents, date, competenceMonth?, status?, categoryId?, accountId?, payeeId?, paymentMethod?, creditCardId?, parentPlannedId?, tags?, notes? }`. Receita é `fixed|extra`; `installment` só via parcelamento. Crédito exige `creditCardId`.
  - Competência (RF-02/03): a informada; senão a da fatura, no crédito (RF-30); senão o mês da data. No `PATCH` de lançamento manual, mudar data, forma ou cartão recalcula.
  - Status padrão (RF-24): gasto do dia e receita extra nascem `settled`. Fixa, planejamento e **qualquer compra no crédito** nascem `forecast`; a compra vira `settled` quando a fatura é paga.
  - Editar um lançamento gerado por modelo ou parcelamento marca `isOverride` (RF-12/47) e não permite mudar tipo nem natureza.
  - `parentPlannedId` (RF-22): precisa ser um planejamento de despesa do usuário; o gasto vai para a competência do planejamento. Excluir o planejamento desvincula os gastos. Planejamento com gastos não muda de natureza (`409`).
  - Parcela não pode ser excluída sozinha (`409`): use editar, quitar ou cancelar o parcelamento.
- **Parcelamentos**
  - Rotas: `GET /installment-plans?status=active|finished|all` (traz `indicators`, RF-44, no mês atual) · `GET /installment-plans/summary` → `{ payoffTotalCents, activeCount, byCard, monthly[12], freeFromMonth }` (RF-45) · `GET /installment-plans/:id` → `{ plan, installments }` · `POST` · `PATCH` · `DELETE` · `/restore` · `POST /:id/payoff { amountCents, date, competenceMonth? }` (RF-46) · `POST /:id/cancel` (RF-48).
  - Criar (RF-40..43): `{ description, paymentMethod (padrão credit), creditCardId?, accountId?, payeeId?, categoryId?, purchaseDate, totalCents | installmentCents, installmentsCount (1–480), firstCompetenceMonth?, currentInstallment?, notes? }`.
  - 1ª competência: a informada; senão "mês atual − (k − 1)" com "já estou na parcela k"; senão a fatura da compra.
  - Data de cada parcela: o vencimento da fatura, no crédito; senão o dia da compra em cada mês.
  - `PATCH` com total, nº de parcelas ou 1ª competência regera só as parcelas previstas não editadas (RF-47; só parcelamentos ativos). Descrição, categoria e cartão também vão só para essas parcelas.
  - Quitação: apaga as parcelas previstas, cria um lançamento realizado (`installmentNumber: null`) e guarda `payoffDiscountCents`.
  - Excluir leva as parcelas junto; `restore` traz as duas coisas de volta.
- **Fatura**
  - `GET /credit-cards/:id/statements/:month` → `{ closingDate, dueDate, status: open|closed|paid, totalCents, settledCents, futureTotalCents, transactions }` (RF-31/32).
  - `POST .../pay` marca todos os lançamentos da fatura como realizados.
- **Estabelecimento** — `GET /payees/:id/suggestion` → `{ categoryId, paymentMethod, creditCardId, accountId }`, copiados do último lançamento (RM-03).
- Erros de regra do core (ex.: parcela < R$ 0,01, total menor que o já pago) → `400 VALIDATION`.

Implementado na Fase 3 (schemas em `packages/contracts/src/dashboard.ts`; regras em `packages/core/src/finance/dashboard.ts`):

- **Meses sem gravar nada** — dashboard e projeção leem vários meses de uma vez; meses ainda não abertos ganham, em memória, os previstos dos modelos recorrentes (os mesmos que a RF-11 criaria). Lançamento gerado e excluído não volta.
- **Dashboard** — `GET /months/:month/dashboard?period=month|quarter|year` (padrão `month`; `quarter` = o mês e os 2 anteriores; `year` = o ano civil). Devolve `{ month, period, months, summary, previousSummary, byCategory[{ categoryId, amountCents, previousCents, deltaCents, share }], byPaymentMethod, byAccount, byCard, topPayees[5], budgets[{ categoryId, budgetCents, spentCents, ratio, level: ok|warning|exceeded }], evolution[12] }`.
  - As quebras usam o valor que conta nas saídas (RF-22: planejamento com gastos só pelo que ainda reserva), então somam "Saídas". Subcategorias somam na principal.
  - Orçamento (RF-61): alerta a partir de 80%, estourado a partir de 100%; o teto da principal cobre as subcategorias; em períodos de vários meses o teto é multiplicado.
  - `evolution`: 12 meses terminando no fim do período; mês sem nenhum lançamento tem sobra 0 (sem meta).
- **Projeção** — `GET /projection?from=YYYY-MM&months=12` (padrão: mês atual, 1–24 meses) → `{ from, rows[{ month, incomeCents, fixedCents, installmentCents, plannedCents, variableCents, goalCents, surplusCents }], firstNegativeMonth }` (RF-52).
- **Próximos vencimentos** — `GET /upcoming?days=7` (1–31) → `{ today, items }`. Itens: `{ kind: "transaction", date, amountCents, transaction }` (despesa prevista fora do crédito, inclusive atrasadas até 31 dias) ou `{ kind: "statement", date, amountCents, creditCardId, competenceMonth }` (fatura com valor previsto). Abre (materializa) o mês atual e o seguinte.

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

**Implementado na Fase 5:**

- `GET /asset-classes` (cria as 5 classes padrão para quem não tem — RC-01) · `POST` · `PATCH /:id` · `DELETE /:id` (409 com ativos). `PUT /target-allocations { items: [{ assetClassId, targetPct, maxPct }] }` substitui todas as metas (soma 100 é aviso no front).
- `GET /assets[?archived=true]` · `POST` (ticker validado na lista do provedor em cache, quando existe; renda fixa nasce `quote_mode=manual`; aceita `manualPrice`/`manualValueCents` para já nascer com o preço ou saldo de hoje) · `PATCH /:id` (inclui `manualPrice` e `manualValueCents`) · `DELETE /:id` (soft delete com operações e proventos) · `GET /:id` → `{ position, assetClass, quote, trades, dividends, dividendsTotalCents }`.
- `/asset-trades` CRUD + `/:id/restore`. Quantidade e preço trafegam como **texto decimal** (`"10.5"`). Sem `totalCents`, o total é `round(qtd × preço) + taxas` (venda: − taxas). Qualquer escrita recalcula a posição: venda maior que a posição → 400. `kind=position_set` (ajuste de posição): `quantity` + `unitPrice` = PM; total = qtd × PM. No `PATCH`, campo ausente fica como está.
- `/dividends` CRUD + `/:id/restore` · `POST /dividends/batch { payDate, items }` (RC-41) · `GET /dividends/summary` (12 meses por classe, total do ano, média, maior pagador).
- `GET /portfolio` → totais, alocação × meta por classe, posições (PM, custo, valor, resultado, pesos, proventos 12m, YoC), alertas e status das cotações.
- `POST /quotes/refresh` (botão Atualizar) · `GET /tickers/search?q=` · `GET /jobs/quotes` (cron, `Authorization: Bearer CRON_SECRET`).

**Cache de cotações (custo do provedor):** `quotes_cache` por ticker, compartilhado entre usuários. No pregão (dias úteis, 10h–18h30 BRT) a cotação vale 30 min; fora dele, vale até o próximo pregão se foi buscada depois do último fechamento. Abrir a carteira devolve o cache na hora e atualiza só os vencidos em segundo plano (até 5 por requisição; o botão, até 15). Pedidos simultâneos do mesmo ticker viram uma chamada. Falha: guarda o último preço e espera 6 h. Orçamento mensal em `provider_usage` (`QUOTES_MONTHLY_BUDGET`, padrão 13 mil) — ao atingir, para. Lista de tickers do autocomplete: 1 chamada a cada 7 dias (`provider_cache`). Sem `BRAPI_TOKEN`, nada sai para a internet. No navegador, a carteira fica 5 min em cache e não recarrega ao voltar à aba.


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

### Importação / exportação (Fase 4)

| método | rota                                          |                                                                       |
| ------ | --------------------------------------------- | --------------------------------------------------------------------- |
| POST   | `/imports`                                    | cria a importação (`kind`, `fileName`, `mapping`)                   |
| POST   | `/imports/:id/rows`                           | lote de até 500 rascunhos já interpretados → conferência por linha    |
| POST   | `/imports/:id/commit`                         | grava tudo numa transação (`skipRows`, `createMissing`)             |
| POST   | `/imports/:id/undo`                           | desfaz (soft delete do que foi criado; metas voltam ao valor anterior) |
| GET    | `/imports` · `/imports/mappings`              | histórico · último mapeamento de cada tipo                            |
| GET    | `/exports/:entity?format=csv|json&from=&to=` | `transactions` ou `installment-plans`                                 |
| GET    | `/backup` · POST `/restore`                   | JSON completo · restaurar (`merge` ou `replace`)                      |

- Tipos (`kind`): `transactions`, `installments`, `monthly_sheet` (Fase 4) e `assets`, `trades`, `dividends`, `portfolio_sheet` (Fase 5). Rascunhos da carteira: `classTarget`, `asset`, `assetTrade`, `dividend` — o ativo vai como referência (`ticker` ou `name` + classe + corretora) e é criado no commit se não existir. No fim do commit a posição de cada ativo tocado é recalculada: venda maior que a posição → 400 e nada é gravado (RI-05).
- O arquivo é lido **no navegador** (SheetJS para .xlsx/.xls; CSV pelo core, UTF-8 ou Latin-1). A API recebe **rascunhos** (`importDraftSchema` em `packages/contracts/src/imports.ts`): `transaction`, `installmentPlan` ou `monthGoal`, com contas, cartões, categorias e estabelecimentos **pelo nome**.
- `POST /imports/:id/rows` devolve, por linha, `status` (`ok` · `warning` · `duplicate` · `error`), mensagens e o que será criado ("Conta: Ailos"). Nomes casam sem acento/maiúsculas; sem igualdade exata, vale um único cadastro que comece com o nome ("Nubank" → "Nubank Roxinho"). Cartão inexistente é erro (cartão precisa de fechamento/vencimento); categoria, conta e estabelecimento são criados no commit se `createMissing` (padrão).
- Duplicado (RI-02): mesmo mês de competência + valor + descrição normalizada de um lançamento existente, ou mesma descrição de um lançamento gerado por modelo recorrente no mês; parcelamento com mesma descrição, nº de parcelas e total.
- No commit, um lançamento importado com a mesma descrição de um modelo recorrente ativo **ocupa** o mês do modelo (`recurringTemplateId`), para o modelo não gerar o mesmo salário de novo. Desfazer solta o vínculo.
- Parcelamento importado: 1ª competência informada (ou pela parcela atual, RI-04), parcelas `1..settledCount` pagas; com `payoffMonth`, as restantes viram um pagamento único ("Quitação: …") e o plano fica `paid_off`.
- Exportação: CSV com `;`, BOM e as colunas do template (exportar → editar → importar de volta). `format=json` devolve `{ columns, rows }` e o navegador monta o .xlsx.
- Backup: todas as tabelas do usuário (sem `userId`). Restaurar nunca toca em IDs de outro usuário; referências a cadastros que não são do usuário viram `null`. `replace` faz soft delete do que não está no arquivo.

### Relatos (bugs e melhorias)

Ver docs/15. `GET /auth/me` traz `isAdmin` (usuário em `ADMIN_USERNAMES`).

| Método | Rota                   | Descrição                                                                 |
| ------ | ---------------------- | ------------------------------------------------------------------------- |
| POST   | `/feedback`            | `{ kind, title, description, page?, context? }` → 201; 429 após 20 em 24 h |
| GET    | `/feedback/mine`       | relatos do usuário (status e nota do dono; sem notas do agente)           |
| DELETE | `/feedback/:id`        | retira o próprio relato enquanto **pendente** (409 depois)                |
| GET    | `/admin/feedback`      | só dono (403): `?status=&kind=` → `{ data, counts }` com histórico        |
| PATCH  | `/admin/feedback/:id`  | só dono: `{ status?, priority?, ownerNote? }`; transição inválida → 400   |

### Jobs (protegidos por `CRON_SECRET`)

`GET /jobs/quotes` (diário) · `GET /jobs/keepalive` (opcional)
