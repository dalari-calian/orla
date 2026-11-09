# 07 — Regras de negócio: Balanço mensal e rentabilidade real

O balanço é o **fechamento congelado** do patrimônio num dia escolhido pelo usuário (normalmente logo depois do aporte do mês). Ele existe para responder: _meu patrimônio cresceu de verdade, ou só porque eu coloquei mais dinheiro?_ Core: `packages/core/src/balance`.

## 1. Fazer um balanço

- **RB-01** Botão **"Gravar balanço de Nov/2026"**. O usuário escolhe a data de referência (default hoje). Um balanço por mês de competência (re-fazer = editar o existente).
- **RB-02** O formulário vem **pré-preenchido** com todos os ativos ativos, agrupados por classe e corretora:
  - bolsa: quantidade (da posição na data) × preço (cotação atual, editável) = valor;
  - renda fixa: campo **valor atual** vazio, mostrando o valor do último balanço como referência ("mês passado: R$ 5.012,30") — o usuário digita o saldo que a Rico/Nubank mostra;
  - campos opcionais por ativo: **DY atual**, **P/VP atual** (pré-preenchidos se o provedor tiver);
  - linha extra por corretora: **saldo em conta** (dinheiro parado, proventos não reinvestidos) — conta como patrimônio.
- **RB-03** Resumo ao vivo no topo: total, total por classe, diferença para o mês anterior, aportes do período (calculado), ganho real (calculado).
- **RB-04** Salvar como rascunho; **Fechar balanço** congela os valores (`status=closed`). Balanço fechado pode ser reaberto com confirmação (recalcula indicadores seguintes).
- **RB-05** Totais por classe e por corretora (ex.: Renda Fixa: R$ 5.000 Rico + R$ 5.000 Tesouro 2036 Rico + R$ X Nubank).

## 2. Aportes do período

- **RB-10** Período de um balanço = `(data do balanço anterior, data deste balanço]`.
- **RB-11** `aportes = Σ contributions` no período (resgates para fora entram negativos). Se o usuário não usa `contributions`, fallback: `Σ compras − Σ vendas` em `asset_trades` no período (configurável: `return_contribution_source = contributions | trades`). Proventos **não** são aporte.
- **RB-12** O valor é congelado em `balances.contributions_cents` no fechamento, mas exibido com aviso se os dados de origem mudarem depois.

## 3. Rentabilidade real (descontando aportes)

Como o usuário faz o aporte **logo antes** do balanço, o dinheiro novo não teve tempo de render; logo o padrão é **aporte no fim do período**:

```
V₀ = total do balanço anterior
V₁ = total deste balanço
C  = aportes do período
ganhoReal (R$)   = V₁ − V₀ − C
rentMes %        = ganhoReal / V₀                     (timing = end, padrão)
```

Configuração `contribution_timing`:

- `end` (padrão): `r = (V₁ − C − V₀) / V₀`
- `start`: `r = (V₁ − C − V₀) / (V₀ + C)`
- `dietz`: Modified Dietz ponderando cada aporte pelos dias que ficou aplicado.

Primeiro balanço (sem V₀): mostra só total; rentabilidade "—".

Acumulados:

```
rentAcumulada % (TWR)  = Π (1 + rentMes) − 1          (no ano e desde o início)
ganhoRealAno (R$)      = Σ ganhoReal dos meses do ano
totalAportadoAno       = Σ C
capitalBase            = V(dez do ano anterior) + totalAportadoAno
ganhoSobreCapital %    = ganhoRealAno / capitalBase   ("investi 10 mil, tenho 12 mil → X%")
rentMediaMensal %      = (1 + rentAcumuladaAno)^(1/n) − 1
projeçãoFimDoAno       = V_atual × (1 + rentMediaMensal)^(meses restantes) + aportes previstos (metas mensais)
```

- **RB-20** Proventos do período (`Σ dividends` no período) são exibidos separadamente como **parte** do ganho real ("dos R$ 230 de ganho, R$ 48 vieram de proventos"). Se o usuário **retirou** proventos para a conta corrente (não estão no balanço), lançar como `contribution` negativo — assim não somem do cálculo.
- **RB-21** Rentabilidade **por classe** com a mesma fórmula, usando como aporte da classe `Σ compras − vendas` daquela classe no período.
- **RB-22** Comparativos opcionais (fase futura): CDI, IPCA, IBOV no mesmo período.

## 4. Histórico de preços e indicadores observados

Substitui a planilha de "melhor preço / preço máximo / DY / P/VP":

- **RB-30** Para cada ticker, a partir de todos os `balance_items` (e opcionalmente das cotações do cache no momento dos aportes):
  - **Preço máximo observado** + data;
  - **Menor preço observado** ("melhor preço que já vi") + data;
  - **Preço atual** e distância % do mínimo e do máximo;
  - **Último DY**, **último P/VP**, e o histórico em linha;
  - **Preço médio de compra** ao lado, para comparar.
- **RB-31** Isso **não** é o que foi pago — é o preço visto no momento da conferência (como hoje).
- **RB-32** Tabela ordenável ("quais estão mais perto da mínima que já vi?") — útil para decidir o próximo aporte; link direto "Adicionar à simulação".

## 5. Telas do Balanço

- Lista de balanços (cards por mês: total, ganho real R$ e %, aportes).
- Detalhe/edição de um balanço.
- **Evolução:** gráfico de patrimônio × aportado acumulado; barras de rentabilidade mensal; tabela anual (mês, V₀, aportes, V₁, ganho, %, acumulado).
- **Indicadores observados** (RB-30).

## Decisões (Fase 7)

- **Core** em `packages/core/src/balance`: `periodReturn`, `flowsInPeriod`, `chainRates` (TWR), `balanceSeries`, `yearSummary`, `observedPrices`.
- **Aportado acumulado** (linha do gráfico): o 1º balanço inteiro conta como capital próprio, mais os aportes depois dele.
- **Capital base do ano**: o último balanço do ano anterior; sem ele, o total anterior ao 1º balanço do ano, ou o próprio 1º balanço. A **projeção** usa os meses que faltam depois do último balanço do ano e a meta padrão de investimento como aporte previsto.
- **Fechar** congela aportes e proventos (RB-12: o `GET /balances` avisa quando a origem mudou depois). O balanço mais recente, ao fechar, atualiza o saldo das rendas fixas e o preço dos ativos de preço manual. Balanços importados entram fechados, mas com aporte e proventos calculados ao vivo.
- **Dietz** com aporte congelado diferente do calculado: o aporte é tratado como feito no dia do balanço.
- **Saldo em conta**: uma linha por corretora dos ativos (ou que já tinha saldo), conta como patrimônio.
- **Importação de balanços históricos**: a "Planilha da carteira" agora cria um balanço fechado por mês (renda fixa com o mesmo nome é somada) e um aporte por linha de aporte. Quando uma renda fixa cresce muito além dos aportes da planilha (mais que R$ 50 e 10%), o balanço vem com aviso: dinheiro novo sem aporte registrado conta como rendimento.
- **Aceite × planilha do dono**: o "LUCRO MÊS" da planilha é a variação do "PAT. ATU. RIC" (Rico − todos os aportes do mês, inclusive os do Nubank), sem descontar o aporte de agosto. Não é a rentabilidade real deste doc, então os números não batem por construção. O Orla usa a fórmula daqui, com o patrimônio inteiro.
- **RB-21** (rentabilidade por classe) e **RB-22** (CDI/IPCA/IBOV) ficam para depois.

## Casos de teste obrigatórios

- V₀=10.000, C=1.200, V₁=11.350 → ganho 150, r = 1,5% (end) e 1,339% (start).
- TWR de 3 meses com um mês negativo.
- Resgate (aporte negativo).
- Primeiro balanço sem anterior.
- Balanço reaberto e editado recalcula o mês seguinte.
