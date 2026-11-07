# 05 — Regras de negócio: Carteira

Core: `packages/core/src/portfolio`.

## 1. Classes de ativo

- **RC-01** Classes padrão criadas no cadastro (editáveis, renomeáveis, reordenáveis): **Renda Fixa / Reserva**, **FIIs**, **Ações**, **Exterior**, **Cripto**. Para o usuário, Reserva de Emergência e Renda Fixa são **a mesma classe** (decisão explícita).
- **RC-02** Cada classe tem cor fixa usada em todos os gráficos.

## 2. Ativos

- **RC-10** Ativo de bolsa: ticker (validado no provedor de cotação ao cadastrar, com nome sugerido), classe, corretora (`account`).
- **RC-11** Ativo de renda fixa: nome livre ("Tesouro IPCA+ 2035", "CDB Nubank", "Caixinha Nubank"), corretora/banco, indexador, taxa, vencimento, liquidez. `quote_mode=manual` — o valor vem do **balanço mensal** (o usuário digita o saldo que a corretora mostra).
- **RC-12** Mesmo ticker em duas corretoras = dois ativos. Visão "Por ticker" agrupa; visão "Por corretora" separa.
- **RC-13** Arquivar ativo vendido totalmente (some da posição, histórico preservado).

## 3. Operações (compras/vendas)

- **RC-20** Registro: ativo, tipo, **data**, **quantidade**, **preço unitário**, taxas, **valor total** (calculado: `qtd × preço + taxas`, editável para bater com a nota). Ex.: ITSA4, 01/01/2026, 4 × R$ 7,00 = R$ 28,00.
- **RC-21** Renda fixa: operação `fixed_income_deposit` com valor (quantidade = 1 ou nº de títulos, preço = valor).
- **RC-22** Histórico por ativo: lista cronológica de todas as operações e proventos.

## 4. Posição e preço médio (método da Receita Federal)

`computePosition(trades) → { quantity, avgPrice, costCents, realizedPnlCents }`, processando em ordem de data (desempate por `created_at`):

- **Compra:** `custo += qtd × preço + taxas`; `qtd += qtd`; `pm = custo / qtd`.
- **Venda:** `qtd −= qtd_vendida`; `custo −= qtd_vendida × pm` (**PM não muda na venda**); `lucro realizado += qtd_vendida × (preço − pm) − taxas`. Venda maior que a posição → erro de validação.
- **Bonificação:** `qtd += qtd_bonus`; `custo += qtd_bonus × custo_atribuído` (informado; default 0) → PM recalcula.
- **Desdobramento/grupamento:** `qtd × ratio`; custo igual; PM ajusta.
- **Renda fixa:** custo = Σ depósitos − Σ resgates (proporcionais); posição atual = último valor do balanço.
- Arredondamentos só no final, para centavos (half-even).

## 5. Cotações

- **RC-30** `QuoteProvider` (interface). Implementação v1: **brapi.dev** (plano grátis: 1 ticker por chamada, ~30 min de atraso, 15 mil chamadas/mês).
- **RC-31** Cache em `quotes_cache` com TTL de 30 min. Ao abrir a carteira, a API devolve o cache e dispara atualização _em segundo plano_ só dos tickers vencidos, limitada a N chamadas por requisição.
- **RC-32** Cron diário (Vercel) atualiza todos os tickers de todos os usuários ao fim do pregão (≈18h30 BRT). Orçamento: 50 tickers × (1 cron + ~10 aberturas) × 22 dias ≈ 12 mil/mês — dentro do limite; o job registra o consumo e **para em 13 mil** no mês.
- **RC-33** Sempre exibir a hora da cotação ("há 25 min", "fechamento de ontem"). Se o provedor falhar → último preço conhecido + aviso discreto. O usuário pode **sobrescrever** o preço manualmente.
- **RC-34** DY e P/VP: tentar do provedor; se o plano grátis não fornecer, campo **manual** (preenchido no balanço mensal, como hoje na planilha).

## 6. Valores derivados por ativo

```
valorAtual          = quantidade × cotação (ou saldo do último balanço para renda fixa)
resultado           = valorAtual − custo
resultado %         = resultado / custo
pesoNaClasse %      = valorAtual / Σ valorAtual da classe
pesoNaCarteira %    = valorAtual / patrimônio total
proventos12m        = Σ dividends últimos 12 meses
yieldOnCost %       = proventos12m / custo
```

## 7. Proventos

- **RC-40** Registro: ativo, tipo (dividendo, JCP, rendimento de FII, juros), **data de pagamento**, valor recebido; opcionais: data-com, valor por cota, quantidade base. Ex.: MXRF11, 27/05/2025, R$ 8,00.
- **RC-41** Lançamento em lote do mês: tela com todos os FIIs/ações da carteira e um campo de valor ao lado de cada um (como a planilha) — salva só os preenchidos.
- **RC-42** Proventos **não são aporte** — são retorno da carteira (entram na rentabilidade real, ver doc 07).
- **RC-43** Visões: por mês (barras empilhadas por classe), por ativo, acumulado no ano, média mensal 12m, maior pagador.

## 8. Notícias por ativo

- **RC-50** `NewsProvider` (interface). v1: **Google News RSS** com query `"<TICKER>" OR "<nome da empresa>"`, `hl=pt-BR&gl=BR&ceid=BR:pt-419`. Alternativas plugáveis depois (RSS de fatos relevantes da CVM/B3 via FNET para FIIs).
- **RC-51** Cache em `news_cache` por ticker com TTL de 2 h; busca acontece no servidor (nunca no browser), máximo 20 itens por ticker.
- **RC-52** UI: título, fonte, "há 3 h", abre o link original em nova aba. **Não reproduzir o conteúdo da matéria** — só título/link.
- **RC-53** Feed agregado "Notícias da minha carteira" no dashboard (os 10 mais recentes entre todos os tickers).
- Renda fixa não tem notícias (aba escondida).

## 9. Tela de detalhe do ativo

Cabeçalho: ticker, nome, cotação, variação do dia, hora da cotação. Abas/seções:

1. **Posição:** quantidade, PM, custo, valor atual, resultado (R$ e %), peso na classe e na carteira.
2. **Gráfico:** evolução do valor do ativo pelos balanços mensais (e preço observado).
3. **Operações** (lista + adicionar).
4. **Proventos** (lista + total + YoC).
5. **Preços observados:** máximo visto, mínimo/melhor visto (com datas), último DY, último P/VP — do histórico de balanços (doc 07).
6. **Notícias.**

## 10. Dashboard de Carteira (dados)

1. Card herói: **Patrimônio total**, variação no mês (R$/%), e **rentabilidade real do ano** (doc 07).
2. **Alocação atual × meta** por classe (donut duplo ou barras horizontais com marcador da meta), destacando desvio > 5 p.p.
3. Distribuição por **ativo** (treemap ou lista com barra de peso) e por **corretora**.
4. **Evolução do patrimônio** (linha) × **total aportado acumulado** (linha) — o vão entre as duas é o ganho real.
5. **Rentabilidade real mensal** (barras verdes/vermelhas) + acumulado do ano.
6. **Proventos** por mês (12 meses) + total do ano + média.
7. Maiores altas/baixas (resultado %).
8. Notícias da carteira.
9. Alertas: ativo acima do teto de concentração; classe fora da meta; balanço do mês não feito.

## Casos de teste obrigatórios

- PM com 3 compras e taxas; venda parcial não altera PM; venda acima da posição falha.
- Desdobramento 1:10 e grupamento 10:1.
- Bonificação com custo atribuído.
- Peso na carteira com ativo de renda fixa manual.
