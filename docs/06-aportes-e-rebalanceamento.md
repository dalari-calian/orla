# 06 — Regras de negócio: Aporte e rebalanceamento

Reproduz a "planilha de controle de aporte": informo quanto vou aportar, defino quanto vai para cada classe, simulo compras ativo a ativo e vejo em tempo real quanto falta gastar, se estourei a classe e como a carteira fica depois. Core: `packages/core/src/contribution` — **todo cálculo roda no cliente em tempo real** (função pura), a API só salva.

## 1. Entradas

- **RA-01** **Valor total do aporte** (ex.: R$ 1.200). Sugestão automática = meta de investimento do mês (doc 04, RF-50).
- **RA-02** **Divisão por classe** em % — por padrão copia as metas de alocação (`target_allocations`), editável **só para esta simulação**. Ex.: FIIs 40%, Ações 35%, Renda Fixa 25%.
  - Modo alternativo **"Rebalancear"** (botão): o core sugere a divisão que **aproxima a carteira da meta** após o aporte (ver RA-20).
- **RA-03** Posição atual de cada ativo (quantidade + cotação atual) vem da carteira; o usuário pode editar o preço na simulação (preço que vai pagar).

## 2. Itens da simulação (o "carrinho")

- **RA-10** Adicionar item: escolher ativo (busca), informar **quantidade** _ou_ **valor em R$**:
  - por quantidade → `valor = qtd × preço`;
  - por valor → `qtd = floor(valor / preço)` para ativos de bolsa (ações/FIIs não aceitam fração), mostrando a sobra de troco; renda fixa aceita valor exato.
- **RA-11** Ativo novo (que ainda não tenho) pode ser incluído (cria o ativo ao efetivar).
- **RA-12** Atalhos: "+1 cota", "−1 cota", "completar a classe" (preenche o item com o valor que falta na classe).

## 3. Saídas em tempo real

```
valorClasse[c]         = total × divisao[c] / 100                  (ex.: FIIs → R$ 480)
gastoClasse[c]         = Σ itens da classe c
restanteClasse[c]      = valorClasse[c] − gastoClasse[c]           (+100 "falta gastar" / −60 "passou")
restanteTotal          = total − Σ itens                           (ex.: "dos R$ 1.200, faltam R$ 600")
posPosAporte[a]        = valorAtual[a] + valorItem[a]
patrimonioPos          = patrimônio atual + Σ itens
pesoPos[a] %           = posPosAporte[a] / patrimonioPos
pesoClassePos[c] %     = Σ posPosAporte da classe / patrimonioPos
desvioMeta[c] p.p.     = pesoClassePos[c] − meta[c]
```

- **RA-14** Indicadores visuais:
  - Barra de progresso do total (gasto / total), número grande "Restam R$ 600".
  - Por classe: chip **verde** (restante ≥ 0), **âmbar** (restante entre 0 e −5% do valor da classe), **vermelho** (estourou mais que isso).
  - Por ativo: **peso antes → depois** (ex.: VALE3 8,2% → 9,4%) e alerta se ultrapassar `max_weight_pct` do ativo ("VALE3 ficaria muito predominante: 15% > teto 12%") ou se o peso dentro da classe passar do `target_weight_pct` + 5 p.p.
  - Gráfico **Antes × Depois × Meta** por classe (barras horizontais agrupadas) e por ativo dentro da classe expandida.
- **RA-15** Mostrar também a carteira **sem** esse aporte, para comparação.

## 4. Sugestão de rebalanceamento (opcional, botão)

- **RA-20** Algoritmo "aporte sem venda" (default):
  1. `alvo[c] = (patrimonio + total) × meta[c]`.
  2. `déficit[c] = max(0, alvo[c] − atual[c])`.
  3. Distribui `total` proporcional aos déficits (se Σ déficits < total, distribui o excedente pela meta).
  4. Dentro da classe, mesma lógica com `target_weight_pct` dos ativos (se definidos); senão, sugere os ativos com menor peso relativo.
  5. Converte em cotas inteiras (floor), realoca troco ao maior déficit restante.
- **RA-21** É só sugestão: preenche o carrinho, o usuário ajusta.

## 5. Salvar e efetivar

- **RA-30** Simulação é salva como rascunho automaticamente (`contribution_plans.status=draft`) — dá pra fechar o app e continuar depois. Várias simulações por mês permitidas; uma marcada como principal.
- **RA-31** **Efetivar** ("Comprei"): para cada item, confirma preço e quantidade reais pagos (podem diferir do simulado) e data → cria `asset_trades` (buy) + um `contribution` com o total efetivado → `status=executed`. Ativos novos são criados.
- **RA-32** Efetivação parcial permitida (marcar quais itens foram comprados).
- **RA-33** Após efetivar, sugere: "Fazer o balanço mensal agora?" (o usuário faz o balanço depois dos aportes — doc 07).

## Decisões (Fase 6)

- **Cálculo no navegador**: `simulate`, `suggestSplit`, `suggestClassItems` e `suggestPlan` em `packages/core/src/contribution`. A tela recalcula a cada tecla e a API só salva e efetiva.
- **Divisão em %, com até 8 casas**: dá para dividir em R$ (400 de 1.200 → `33.33333333`). Com a soma em 100%, os valores por classe somam **exatamente** o total (maior resto).
- **Rebalancear** (RA-20) preenche a divisão **e** o carrinho com a sugestão; se já houver itens, pede confirmação. Dentro da classe, os ativos sem peso alvo recebem por igual, ou seja, os de menor peso levam mais. Ativos de bolsa sem preço ficam fora da sugestão.
- **Cores por classe** (RA-14): verde se sobrou ou fechou no valor; âmbar se passou até 5% do valor da classe; vermelho se passou mais que isso. Os alertas de ativo saem do teto na carteira (`max_weight_pct`) e do peso alvo na classe + 5 p.p.
- **Valor sugerido** (RA-01): o que falta investir da meta do mês (`goalRemainingCents`); se ela já foi cumprida, a meta inteira.
- **Efetivar** soma o total ao **investido da meta do mês** (a meta funciona como uma conta). Isso pode ser desmarcado na efetivação.
- **RA-33** (sugerir o balanço depois de efetivar) fica para a Fase 7, junto com o Balanço.

## Casos de teste obrigatórios

- Exemplo da planilha: total 1.200, divisão 500/400/300, item VALE3 R$ 100 → restante total 1.100, restante Ações 300.
- Estouro de classe (−60).
- Item por valor com preço não divisível → cotas inteiras e troco.
- Rebalanceamento quando uma classe já está acima da meta (recebe 0).
- Soma das divisões ≠ 100% → erro de validação mostrado na UI.
