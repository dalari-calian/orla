# 04 — Regras de negócio: Finanças

Tudo que calcula fica em `packages/core/src/finance`. Cada regra abaixo tem ID (`RF-xx`) para referenciar em testes e PRs.

## 1. Mês de competência

- **RF-01** Todo lançamento pertence a um `competence_month`. A tela de Finanças sempre mostra **um mês** (seletor ◀ Nov 2026 ▶, swipe lateral no mobile).
- **RF-02** Para PIX, débito, dinheiro, boleto: competência = mês da `date` (default, editável).
- **RF-03** Para crédito: competência = mês da **fatura** em que a compra cai (ver RF-30). O usuário pode alterar.

## 2. Receitas

### Salário base (modelo recorrente)

- **RF-10** O usuário cadastra um ou mais `recurring_templates` de receita (ex.: "Salário", R$ 6.000, dia 5, a partir de Jan/2026, sem fim).
- **RF-11** Ao abrir um mês (ou ao gerar a projeção de N meses à frente), o sistema **materializa** um `transaction` `nature=fixed, status=forecast, source=template` para cada template ativo naquele mês, se ainda não existir (idempotente via `UNIQUE(template_id, competence_month)`).
- **RF-12** Editar o valor **daquele mês** (ex.: salário real de Nov foi R$ 6.180,32) altera só a transação e marca `is_override=true`. Os demais meses continuam com a média.
- **RF-13** Editar o **template** pergunta: _"Aplicar a partir de qual mês?"_ → atualiza as transações geradas **não-override** com `competence_month ≥ mês escolhido`. Meses passados e overrides não mudam.
- **RF-14** Excluir o template pergunta se remove também os lançamentos futuros previstos (nunca remove os realizados).
- **RF-15** Marcar como recebido: `status → settled` (botão "Recebi" / swipe).

### Receitas extras

- **RF-16** Lançamento avulso `type=income, nature=extra` (presente de aniversário R$ 300, PIX recebido, bônus, venda de algo). Soma no total de entradas do mês.
- **RF-17** Entradas do mês = Σ receitas (fixas + extras), exibindo separadamente: **Previsto** (todas) e **Recebido** (só `settled`).

## 3. Despesas

- **RF-20** Campos: descrição, valor, data, categoria, **forma de pagamento** (`pix`, `debit`, `credit`, `cash`, `boleto`, `transfer`), **conta/instituição** de onde saiu (Nubank, Itaú…), **cartão** (se crédito), **estabelecimento/quem recebeu** (`payee`, autocomplete com criação rápida), natureza, tags, observação.
- **RF-21** Naturezas:
  - `fixed` — recorrente via template (aluguel, internet, academia, streaming). Mesmas regras RF-11..14.
  - `variable` — gasto do dia a dia à vista.
  - `planned` — **planejamento**: valor reservado para um mês futuro sem parcelas (ex.: "Meu aniversário", Out/2026, R$ 200). Entra na previsão do mês como despesa prevista.
  - `installment` — parcela de um parcelamento (gerada automaticamente).
- **RF-22** Planejamento: na data, o usuário pode (a) **realizar** o planejamento (vira `settled`, valor editável), (b) **lançar gastos vinculados** a ele — o planejamento mostra _gasto X de Y_; o saldo não usado continua contando como previsto até o mês terminar ou o usuário dar "concluir". Implementação: `planned` com filhos via `parent_planned_id` (adicionar coluna) — Σ filhos settled ≤ planejado; previsão do mês usa `max(planejado, Σ filhos)`.
- **RF-23** Planejamento recorrente anual (aniversário todo outubro) = template com `frequency=yearly` (adicionar `frequency: monthly|yearly` e `month_of_year` em `recurring_templates`).
- **RF-24** Status de despesa: `forecast` (a pagar) / `settled` (paga). Gastos lançados no dia já nascem `settled`. Fixas e parcelas nascem `forecast`.
- **RF-25** Duplicar lançamento (ação rápida) e "lançar de novo" a partir de um anterior.

## 4. Cartão de crédito e faturas

- **RF-30** Regra de fatura: compra no dia `d` com cartão de fechamento `F` e vencimento `V`:
  - se `d < F` (antes do fechamento) → fatura que fecha neste mês;
  - se `d ≥ F` → fatura que fecha no mês seguinte.
  - **Competência da fatura = mês do vencimento** (configurável em `user_settings.card_competence = due_month | closing_month`; padrão `due_month`, que é como o dinheiro sai da conta).
  - Fechamento em dia inexistente (31 em fevereiro) → último dia do mês.
- **RF-31** Visão "Fatura": por cartão e mês, lista de lançamentos de crédito, total, data de fechamento/vencimento, status (aberta/fechada/paga). Marcar fatura como paga → todos os lançamentos dela `settled`.
- **RF-32** Total de faturas futuras por cartão (quanto já está comprometido nos próximos meses).

## 5. Parcelamentos

- **RF-40** Criar parcelamento: descrição, estabelecimento, categoria, cartão, data da compra, **valor total** _ou_ **valor da parcela** (um calcula o outro), **nº de parcelas**, e opcionalmente "**já estou na parcela k**" (para cadastrar compras antigas vindas da planilha).
- **RF-41** Divisão: `parcela = floor(total / n)`; o resto de centavos vai na **1ª parcela** (padrão de mercado). Se o usuário informar o valor da parcela, `total = parcela × n` (editável se a loja arredondou diferente).
- **RF-42** Gera `n` transações `nature=installment`, `installment_number=i`, competências consecutivas a partir de `first_competence_month` (calculada por RF-30 a partir da data da compra).
- **RF-43** Cadastro "já estou na parcela k": parcelas `1..k-1` são criadas como `settled` (histórico), `k..n` como `forecast`.
- **RF-44** Indicadores de cada parcelamento (derivados, não persistidos):
  - **Parcela atual** = parcela cuja competência é o mês visualizado (ex.: 2/12). Fora do intervalo → "não começou" / "finalizado".
  - **Pago até agora** = Σ parcelas `settled` (alternativamente: Σ parcelas com competência ≤ mês corrente — usar `settled`, mais fiel).
  - **Falta pagar / para quitar** = total − pago.
  - **Parcelas restantes** = n − pagas.
  - **Progresso** = pago / total (barra).
  - **Término** = competência da última parcela.
- **RF-45** **Totalizador de quitação**: Σ "falta pagar" de todos os parcelamentos `active` (ex.: Switch R$ 1.000 + Tênis R$ 300 = **R$ 1.300**). Também por cartão e o **compromisso mensal** = Σ parcelas previstas por mês nos próximos 12 meses (gráfico de barras "quando eu fico livre das parcelas").
- **RF-46** Quitar antecipadamente: informa valor pago (pode ter desconto) e data → cria uma transação `settled` com esse valor na competência escolhida, cancela (soft delete) as parcelas `forecast` restantes, `status=paid_off`. Registra o desconto obtido (falta pagar − valor pago).
- **RF-47** Editar parcelamento (valor, nº parcelas) regera apenas parcelas `forecast` não-override; parcelas pagas nunca mudam.
- **RF-48** Estorno/cancelamento: `status=canceled`, parcelas futuras removidas.

## 6. Meta de investimento e sobra do mês

- **RF-50** Meta padrão de investimento: valor fixo (R$ 1.200) **ou** % das receitas do mês (20%). Configurável em Configurações; sobrescrevível por mês (`month_settings.savings_goal_cents`).
- **RF-51** Fórmulas do mês (core: `computeMonthSummary(transactions, settings)`):
  ```
  entradasPrevistas  = Σ income (todas)
  entradasRecebidas  = Σ income settled
  saidasPrevistas    = Σ expense (todas, incl. planejamentos pelo RF-22 e parcelas)
  saidasPagas        = Σ expense settled
  metaInvestimento   = month_settings ?? user_settings (valor ou % de entradasPrevistas)
  sobraPrevista      = entradasPrevistas − saidasPrevistas − metaInvestimento
  saldoAtual         = entradasRecebidas − saidasPagas            (o que de fato está na conta do mês)
  livreParaGastar    = sobraPrevista (se > 0) — "quanto ainda posso gastar sem furar a meta"
  ```
  - `sobraPrevista < 0` → estado de alerta (vermelho) "Você vai furar a meta em R$ X".
- **RF-52** Projeção dos próximos 12 meses: para cada mês, entradas previstas (templates), saídas previstas (fixas + parcelas + planejamentos), meta, sobra. Mostra o mês em que a sobra fica negativa.
- **RF-53** O valor efetivamente aportado no mês (módulo Aporte → `contributions`) aparece no resumo como "Investido: R$ X de R$ meta".

## 7. Categorias e orçamento

- **RF-60** Categorias padrão no cadastro (editáveis): Moradia, Mercado, Alimentação fora, Transporte, Saúde, Educação, Lazer, Assinaturas, Compras, Presentes, Pets, Viagem, Outros · Receitas: Salário, Extra, Presente, Reembolso, Outros.
- **RF-61** Teto mensal por categoria (opcional) → barra de progresso e alerta a 80% e 100%.

## 8. Dashboard de Finanças (dados)

Para o mês selecionado e com comparação ao mês anterior:

1. Card herói: **Sobra prevista** (grande), com Entradas / Saídas / Meta.
2. Anel de progresso: gasto realizado vs. previsto.
3. Gastos por **categoria** (donut + lista ordenada, variação vs. mês anterior).
4. Gastos por **forma de pagamento** (barras: crédito, PIX, débito…).
5. Gastos por **conta/instituição** e por **cartão**.
6. **Parcelamentos**: totalizador de quitação + compromisso mensal futuro (barras 12 meses).
7. **Evolução 12 meses**: entradas × saídas × sobra (linhas/barras).
8. Próximos vencimentos (fixas e faturas a pagar nos próximos 7 dias).
9. Top estabelecimentos do mês.
10. Orçamentos por categoria estourando.

## Casos de teste obrigatórios (core)

- Parcelamento de R$ 100,00 em 3× → 33,34 + 33,33 + 33,33.
- Compra no dia do fechamento cai na fatura seguinte.
- Fechamento dia 31 em fevereiro.
- Template editado a partir de Mar não altera Jan/Fev nem overrides.
- Cadastro de parcelamento na parcela 5/12 → 4 settled, 8 forecast, "falta pagar" correto.
- Quitação antecipada com desconto.
- Meta em % com receita extra no mês.
- Planejamento com gastos filhos acima e abaixo do planejado.
