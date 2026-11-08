# CLAUDE.md — Orla

Este repositório é o **Orla**, um app pessoal de **controle financeiro + carteira de investimentos**, web, mobile-first, responsivo para desktop. A especificação completa está em `/docs`. **Leia `docs/00-INDICE.md` antes de qualquer tarefa** e o documento específico do módulo em que for trabalhar.

## Regras inegociáveis

1. **Dinheiro nunca é `float`.** Valores monetários são inteiros em **centavos** (`bigint` no banco, `number` inteiro no TS — seguro até ~9e15). Quantidades e preços unitários de ativos usam `numeric` no banco e `decimal.js` no código (o mesmo `Decimal` que o Prisma usa) (`packages/core/money`). Ver `docs/03-modelo-de-dados.md#convencoes`.
2. **Regra de negócio mora em `packages/core`.** Funções puras, sem I/O, sem banco, sem React. API e Web só orquestram. Tudo que calcula (sobra do mês, parcelas, preço médio, rentabilidade, simulador de aporte) fica no core e tem **teste unitário obrigatório** (Vitest).
3. **Contratos compartilhados em `packages/contracts`** (schemas Zod de request/response). Web e API importam o mesmo schema. Nunca duplique tipos de DTO.
4. **Todo dado é do usuário.** Toda tabela de domínio tem `user_id`; toda query na API é filtrada por `user_id` da sessão. Nunca aceite `user_id` vindo do cliente.
5. **Mês de competência** é guardado como `date` no primeiro dia do mês (`2026-11-01`). Fuso de referência: `America/Sao_Paulo`.
6. **Soft delete** (`deleted_at`) em entidades de domínio; nada é apagado fisicamente pela UI.
7. **Código em inglês, interface em pt-BR.** Use o glossário abaixo para nomear coisas.
8. **Mobile-first de verdade:** escreva o CSS para 375px primeiro e expanda com breakpoints `md`/`lg`. Teste toda tela em 375px e 1440px.
9. Não adicione dependências pesadas sem necessidade. Antes de instalar algo, verifique se o que já existe resolve.
10. Siga a fase atual do `docs/13-roadmap.md`. Não implemente funcionalidades de fases futuras sem pedido explícito.

## Glossário (pt-BR → código)

| Domínio (UI)                                    | Código                                        |
| ----------------------------------------------- | --------------------------------------------- |
| Lançamento / transação                          | `transaction`                                 |
| Receita / Despesa                               | `income` / `expense`                          |
| Mês de competência                              | `competenceMonth`                             |
| Natureza: fixa, variável, planejamento, parcela | `fixed`, `variable`, `planned`, `installment` |
| Status: previsto, realizado                     | `forecast`, `settled`                         |
| Modelo recorrente (salário base, conta fixa)    | `recurringTemplate`                           |
| Parcelamento                                    | `installmentPlan`                             |
| Fatura do cartão                                | `cardStatement`                               |
| Instituição / conta (banco, corretora)          | `account`                                     |
| Estabelecimento / quem recebeu                  | `payee`                                       |
| Classe de ativo (FIIs, Ações, Renda Fixa)       | `assetClass`                                  |
| Ativo                                           | `asset`                                       |
| Operação (compra/venda)                         | `assetTrade`                                  |
| Provento (dividendo, JCP, rendimento)           | `dividend`                                    |
| Balanço mensal / snapshot                       | `balance` / `balanceItem`                     |
| Aporte externo                                  | `contribution`                                |
| Simulação de aporte                             | `contributionPlan`                            |
| Meta de alocação                                | `targetAllocation`                            |

## Comandos

```bash
pnpm doctor         # = node scripts/doctor.mjs — verifica se a máquina tem tudo para rodar o projeto
pnpm install
pnpm dev            # web (5173) + api (3333) em paralelo (turbo)
pnpm db:up          # sobe Postgres local (docker compose, porta POSTGRES_PORT do .env = 5433)
pnpm db:down        # para o Postgres (os dados ficam no volume)
pnpm db:studio      # Prisma Studio para ver os dados
pnpm db:migrate:dev # prisma migrate dev (cria migration a partir do schema.prisma)
pnpm db:migrate     # prisma migrate deploy (aplica migrations)
pnpm db:seed        # dados de exemplo
pnpm test           # vitest em todos os pacotes
pnpm lint && pnpm typecheck
```

## Definição de pronto (para cada tarefa)

- `pnpm lint`, `pnpm typecheck` e `pnpm test` passando.
- Regra nova no core → teste cobrindo caso feliz, bordas (arredondamento, mês de virada, parcela única) e erro.
- Tela nova → funciona em 375px e 1440px, tema claro e escuro, estados de carregando / vazio / erro.
- Tela/ação nova → microinterações do `docs/09-design-system.md` › Movimento (resposta ao toque, entrada suave, número herói animado), discretas e desligadas com `prefers-reduced-motion`.
- Endpoint novo → validado com o schema Zod de `packages/contracts`, filtrado por `user_id`, documentado em `docs/11-api.md`.
- Migration gerada e versionada (nunca edite migration já aplicada).
