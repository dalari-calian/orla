# 03 — Modelo de dados

## Convenções

- **Dinheiro:** `bigint` em **centavos** (`amount_cents`). R$ 1.234,56 → `123456`. Nunca `float`/`real`.
- **Quantidade de ativo:** `numeric(20,8)` (aceita frações: cotas de fundo, cripto, Tesouro).
- **Preço unitário:** `numeric(20,8)` em reais (ex.: `7.00000000`). Valor total de uma operação = `round(qtd × preço × 100)` centavos + taxas, arredondamento **half-even** no core.
- **Percentuais:** `numeric(7,4)` em pontos percentuais (30% → `30.0000`).
- **Mês de competência:** `date` sempre dia 1 (`2026-11-01`). Constraint `CHECK (extract(day from competence_month) = 1)`.
- **IDs:** `uuid` v7 (ordenável) gerado na aplicação.
- **Auditoria:** toda tabela de domínio tem `user_id`, `created_at`, `updated_at`, `deleted_at` (soft delete).
- **Enums** como `text` + `CHECK` (mais fácil de evoluir que enum nativo).
- Índices compostos sempre começando por `user_id`.

## Diagrama (resumo)

```
users ─┬─ accounts (bancos, corretoras, carteiras)
       ├─ credit_cards ── (account)
       ├─ categories (receita/despesa, hierárquica 1 nível)
       ├─ payees (estabelecimentos / quem pagou / quem recebeu)
       ├─ recurring_templates ──┐
       ├─ installment_plans ────┤
       ├─ transactions ◄────────┘ (gerado por template ou plano, ou avulso)
       ├─ month_settings (meta de investimento do mês, observações)
       │
       ├─ asset_classes ── target_allocations (por classe)
       ├─ assets ── asset_target_weights (peso dentro da classe, opcional)
       ├─ asset_trades (compra/venda/bonificação/desdobramento)
       ├─ dividends
       ├─ contributions (aportes externos — o dinheiro que entra na carteira)
       ├─ contribution_plans ── contribution_plan_items (simulações)
       ├─ balances ── balance_items (snapshot mensal)
       │
       ├─ import_jobs ── import_rows
quotes_cache, news_cache (globais, sem user_id)
```

## Tabelas — Usuários e sessão

- `users`: `id, username (único, minúsculo), password_hash (bcrypt), display_name, created_at, last_login_at`
- `sessions`: `id, user_id, refresh_token_hash, user_agent, ip, expires_at, revoked_at, created_at` (refresh token rotacionado; logout revoga)
- `invite_codes` (opcional, se quiser códigos de convite de uso único em vez de env): `code, used_by, used_at`

O schema fica em `packages/db/prisma/schema.prisma`; nomes de tabela/coluna em snake_case via `@@map`/`@map`, models em PascalCase.

## Tabelas — Finanças

### `accounts`

Instituições/contas onde o dinheiro está ou por onde passa.

| campo       | tipo | notas                                                     |
| ----------- | ---- | --------------------------------------------------------- |
| id, user_id | uuid |                                                           |
| name        | text | "Nubank", "Rico", "Itaú", "Carteira (dinheiro)"           |
| kind        | text | `checking` · `savings` · `brokerage` · `wallet` · `other` |
| color       | text | hex para identificar na UI                                |
| is_archived | bool |                                                           |

### `credit_cards`

| campo       | tipo            | notas             |
| ----------- | --------------- | ----------------- |
| id, user_id | uuid            |                   |
| account_id  | uuid → accounts | banco emissor     |
| name        | text            | "Nubank Roxinho"  |
| closing_day | smallint 1–31   | dia de fechamento |
| due_day     | smallint 1–31   | dia de vencimento |
| limit_cents | bigint null     | opcional          |

### `categories`

| campo                | tipo        | notas                                     |
| -------------------- | ----------- | ----------------------------------------- |
| id, user_id          | uuid        |                                           |
| kind                 | text        | `income` · `expense`                      |
| name                 | text        | "Mercado", "Lazer", "Salário", "Presente" |
| parent_id            | uuid null   | 1 nível de subcategoria                   |
| icon, color          | text        | SF-symbol-like (lucide)                   |
| monthly_budget_cents | bigint null | teto opcional por categoria               |

### `payees`

| id, user_id, name (único por usuário, case-insensitive), default_category_id null |

### `recurring_templates`

Modelos que **projetam** lançamentos nos meses: salário base, aluguel, assinaturas.

| campo                             | tipo          | notas                                           |
| --------------------------------- | ------------- | ----------------------------------------------- |
| id, user_id                       | uuid          |                                                 |
| type                              | text          | `income` · `expense`                            |
| nature                            | text          | `fixed` ou `planned` (planejamento recorrente)  |
| description                       | text          | "Salário"                                       |
| amount_cents                      | bigint        | valor padrão (a média)                          |
| category_id, account_id, payee_id | uuid null     |                                                 |
| payment_method                    | text null     | ver enum abaixo                                 |
| credit_card_id                    | uuid null     |                                                 |
| frequency                         | text          | `monthly` · `yearly`                            |
| month_of_year                     | smallint null | 1–12, só para `yearly` (aniversário em outubro) |
| day_of_month                      | smallint      | dia previsto                                    |
| start_month                       | date          | competência inicial                             |
| end_month                         | date null     | null = indefinido                               |
| is_active                         | bool          |                                                 |

### `installment_plans`

Uma compra parcelada (ex.: Nintendo Switch 12×).

| campo                  | tipo         | notas                                                                    |
| ---------------------- | ------------ | ------------------------------------------------------------------------ |
| id, user_id            | uuid         |                                                                          |
| description            | text         | "Nintendo Switch"                                                        |
| payee_id, category_id  | uuid         |                                                                          |
| credit_card_id         | uuid null    | null se parcelado em boleto/carnê                                        |
| payment_method         | text         | normalmente `credit`                                                     |
| purchase_date          | date         |                                                                          |
| total_cents            | bigint       | valor total da compra                                                    |
| installments_count     | smallint ≥ 1 | 12                                                                       |
| first_competence_month | date         | competência da parcela 1 (calculada pelo fechamento do cartão, editável) |
| status                 | text         | `active` · `paid_off` · `canceled`                                       |
| paid_off_at            | date null    | quitação antecipada                                                      |
| notes                  | text         |                                                                          |

### `transactions`

Toda linha do mês. Receitas, despesas, parcelas, planejamentos — tudo aqui.

| campo                             | tipo          | notas                                                                      |
| --------------------------------- | ------------- | -------------------------------------------------------------------------- |
| id, user_id                       | uuid          |                                                                            |
| type                              | text          | `income` · `expense`                                                       |
| nature                            | text          | `fixed` · `variable` · `planned` · `installment` · `extra` (receita extra) |
| status                            | text          | `forecast` (previsto) · `settled` (realizado/pago)                         |
| description                       | text          |                                                                            |
| amount_cents                      | bigint > 0    | sempre positivo; o sinal vem de `type`                                     |
| competence_month                  | date          | mês ao qual pertence                                                       |
| date                              | date          | data do gasto/recebimento                                                  |
| category_id, account_id, payee_id | uuid null     |                                                                            |
| payment_method                    | text null     | `pix` · `debit` · `credit` · `cash` · `boleto` · `transfer` · `other`      |
| credit_card_id                    | uuid null     | obrigatório se `payment_method = credit`                                   |
| recurring_template_id             | uuid null     | origem                                                                     |
| installment_plan_id               | uuid null     | origem                                                                     |
| installment_number                | smallint null | 1..N                                                                       |
| parent_planned_id                 | uuid null     | gasto vinculado a um planejamento (RF-22)                                  |
| is_override                       | bool          | true se o usuário editou um lançamento gerado por template                 |
| tags                              | text[]        |                                                                            |
| notes                             | text          |                                                                            |
| source                            | text          | `manual` · `import` · `template` · `plan` · `bot`                          |

Índices: `(user_id, competence_month)`, `(user_id, installment_plan_id)`, `UNIQUE (recurring_template_id, competence_month) WHERE deleted_at IS NULL`, `UNIQUE (installment_plan_id, installment_number) WHERE deleted_at IS NULL`.

### `month_settings`

| campo                     | tipo             | notas                                                      |
| ------------------------- | ---------------- | ---------------------------------------------------------- |
| user_id, competence_month | PK composta      |                                                            |
| savings_goal_cents        | bigint null      | meta de investimento do mês (null = usa padrão do usuário) |
| notes                     | text             |                                                            |
| closed_at                 | timestamptz null | mês "fechado" (só aviso, não bloqueia)                     |

`user_settings`: `default_savings_goal_cents`, `default_savings_goal_pct` (alternativo), `card_competence` (`due_month` · `closing_month`), `contribution_timing` (`end` · `start` · `dietz`), `return_contribution_source` (`contributions` · `trades`), `currency='BRL'`, `theme`, `hide_values`.

## Tabelas — Investimentos

### `asset_classes`

| id, user_id, name ("Renda Fixa/Reserva", "FIIs", "Ações", "Exterior", "Cripto"), kind (`fixed_income` · `reit` · `stock` · `etf` · `international` · `crypto` · `other`), color, sort_order |

### `target_allocations`

| user_id, asset_class_id, target_pct numeric(7,4), max_pct null (teto de alerta) | soma das metas ativas deve ser 100 (validado no core; aviso, não bloqueio enquanto edita). |

### `assets`

| campo             | tipo         | notas                                                          |
| ----------------- | ------------ | -------------------------------------------------------------- |
| id, user_id       | uuid         |                                                                |
| asset_class_id    | uuid         |                                                                |
| ticker            | text null    | "ITSA4", "MXRF11" — null para renda fixa                       |
| name              | text         | "Itaúsa PN", "Tesouro IPCA+ 2035", "CDB Nubank 100% CDI"       |
| account_id        | uuid         | corretora/banco de custódia                                    |
| quote_mode        | text         | `auto` (busca cotação) · `manual` (valor informado no balanço) |
| fixed_income_info | jsonb null   | `{indexer: 'CDI'                                               | 'IPCA' | 'PRE' | 'SELIC', rate: '100% CDI' | 'IPCA+6.5', maturity: date, liquidity: 'daily' | 'at_maturity'}` |
| target_weight_pct | numeric null | peso desejado **dentro da classe** (opcional)                  |
| max_weight_pct    | numeric null | teto de concentração na carteira toda (alerta no aporte)       |
| is_archived       | bool         |                                                                |

Um mesmo ticker em duas corretoras = **dois `assets`** (mesmo ticker, `account_id` diferente). A UI agrupa por ticker quando útil.

### `asset_trades`

| campo                 | tipo          | notas                                                                                                                                    |
| --------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| id, user_id, asset_id | uuid          |                                                                                                                                          |
| kind                  | text          | `buy` · `sell` · `bonus` (bonificação) · `split` · `reverse_split` · `subscription` · `fixed_income_deposit` · `fixed_income_withdrawal` |
| trade_date            | date          |                                                                                                                                          |
| quantity              | numeric(20,8) |                                                                                                                                          |
| unit_price            | numeric(20,8) |                                                                                                                                          |
| fees_cents            | bigint        | corretagem, emolumentos                                                                                                                  |
| total_cents           | bigint        | `round(qtd × preço) + taxas` (compra); persistido para bater com a nota                                                                  |
| split_ratio           | numeric null  | para split/grupamento                                                                                                                    |
| contribution_plan_id  | uuid null     | se veio de uma simulação efetivada                                                                                                       |
| notes                 | text          |                                                                                                                                          |

### `dividends`

| id, user_id, asset_id, kind (`dividend` · `jcp` · `income` (rendimento FII) · `interest` · `other`), pay_date, ex_date null, amount_cents (líquido recebido), gross_cents null, quantity_base null, per_share null, notes |

### `contributions`

Aportes **externos** — dinheiro novo que entra na carteira vindo do salário. É o número que se desconta na rentabilidade real.
| id, user_id, date, competence_month, amount_cents (pode ser negativo = resgate para fora), account_id null, notes, contribution_plan_id null |

> Por padrão, ao efetivar uma simulação de aporte, o sistema cria **um `contribution`** com o total + as `asset_trades`. O usuário também pode lançar aporte manual.

> **Fase 6:** `contribution_plans.is_primary` (uma principal por mês: índice parcial único) e `deleted_at`. `contribution_plan_items` ganhou `new_asset` (jsonb `{ticker, name, assetClassId}` para ativo que ainda não existe; CHECK `asset_id` ou `new_asset`), `executed_trade_id` e `executed_at` (efetivação parcial). `contributions` tem `deleted_at`. As restrições CHECK das tabelas novas (aporte e relatos) estão na migration `restricoes_aporte_relatos`.

### `contribution_plans` / `contribution_plan_items`

Simulações salvas.

- plan: `id, user_id, competence_month, name, total_cents, status (draft · executed · discarded), class_split jsonb ({asset_class_id: pct}), executed_at`
- item: `id, plan_id, asset_id, mode (by_value · by_quantity), quantity, unit_price, value_cents, sort_order`

### `balances` / `balance_items`

Snapshot mensal congelado (o "balanço mensal" da planilha).

- balance: `id, user_id, reference_date (data do fechamento), competence_month (UNIQUE por user), total_cents (somatório congelado), contributions_cents (aportes do período, congelado), dividends_cents (proventos do período, congelado), notes, status (draft · closed)`
- item: `id, balance_id, asset_id, asset_class_id (congelado), account_id (congelado), quantity, unit_price (preço observado no dia), value_cents, dy_pct null, pvp null, extra jsonb (outros indicadores)`

> **Fase 5:** `assets` ganhou `manual_price`/`manual_price_at` (RC-33) e `manual_value_cents`/`manual_value_at` (saldo da renda fixa até o balanço). `target_allocations` tem PK `asset_class_id`. Tabelas globais `provider_cache` (respostas do provedor por chave, ex.: lista de tickers) e `provider_usage` (chamadas por provedor e mês, para o orçamento). `quotes_cache` guarda também `name`, `quoted_at`, `error_at`/`error` (última falha).

### `quotes_cache` (global)

`ticker PK, price numeric, change_pct, fetched_at, source, payload jsonb`

### `price_observations` (view materializável ou query)

Derivado de `balance_items` + `quotes_cache`: **preço máximo observado, mínimo ("melhor preço") observado, data de cada um, último DY, último P/VP** por ticker e usuário. Não é tabela — é query.

### `news_cache` (global)

`id, ticker, title, url (UNIQUE), source, published_at, fetched_at`

## Tabelas — Importação

- `import_jobs`: `id, user_id, kind (transactions · installments · assets · trades · dividends · balances), file_name, mapping jsonb, status (parsed · validated · committed · failed), stats jsonb, created_at`
- `import_rows`: `id, job_id, row_number, raw jsonb, parsed jsonb, errors jsonb, entity_id null`
  → permite **desfazer uma importação** (soft delete de tudo com `entity_id` do job).

## Decisões em aberto

- [ ] Ativos internacionais em USD: v1 guarda só BRL; v2 adiciona `currency` + câmbio.
- [x] **Parse de valores digitados (`parseBRL`, Fase 0):** com vírgula, ela é o separador decimal e os pontos são de milhar. Sem vírgula, o ponto é ambíguo: `1.500` (grupos de 3 dígitos) = R$ 1.500,00; `10.5` / `10.50` (1–2 casas) = R$ 10,50. Mais de 2 casas decimais (`12,345`) é **rejeitado**, não arredondado. Aceita `R$`, espaços, `-10`, `(10)`, `10-` e o sinal `−` (U+2212).
- [x] **Fase 0:** a migration inicial cria só `users` e `sessions` (base da auth da Fase 1); o seed cria o usuário `demo` / senha `orla1234`.
- [x] **Fase 1:** `user_settings` ganhou `onboarding_completed_at` (o onboarding aparece até ser concluído ou pulado). `recurring_templates` foi criada já completa, mas na Fase 1 só recebe o salário base do onboarding. Unicidade sem diferenciar maiúsculas, ignorando excluídos (índices parciais em `lower(name)`): `accounts` e `payees` por usuário; `categories` por usuário + tipo + pai. Contas com cartão ativo e categorias com subcategorias não podem ser excluídas (`409`).
- [x] **Fase 2:**
  - `installment_plans` ganhou `account_id` (boleto/carnê) e `payoff_discount_cents` (RF-46). A quitação é um `transaction` realizado, com `installment_plan_id` preenchido e `installment_number = null`.
  - O índice único (modelo, mês) **não** ignora excluídos: um lançamento gerado que o usuário apagou não volta ao reabrir o mês.
  - O gasto vinculado a um planejamento fica na competência do planejamento.
  - Compra no crédito nasce `forecast`, porque o dinheiro só sai ao pagar a fatura.
  - Editar um modelo "a partir de X" não mexe em lançamentos já realizados.
  - Meses ainda não abertos são materializados com os valores atuais do modelo. Isso vale também para um mês passado aberto pela primeira vez depois de uma edição.
- [x] **Ícones de categoria:** lista fechada de nomes do lucide em `packages/core/src/finance/catalog.ts` (`CATEGORY_ICONS`), validada na API.
