# 10 — Telas e fluxos

## Mapa de navegação

```
/login · /cadastro
/                       Início
/financas               Mês atual (lista + resumo)       ?mes=2026-11
/financas/dashboard     Dashboard financeiro             ?mes=
/financas/parcelamentos Lista + totalizador de quitação
/financas/parcelamentos/:id
/financas/cartoes/:id/fatura?mes=
/financas/projecao      Próximos 12 meses
/carteira               Posição por classe
/carteira/dashboard
/carteira/ativos/:id    Detalhe do ativo (posição, operações, proventos, preços, notícias)
/carteira/proventos
/aporte                 Simulador (rascunho do mês)
/aporte/:planId
/balanco                Lista de balanços
/balanco/:mes           Fazer/editar balanço
/balanco/evolucao       Rentabilidade real
/balanco/precos         Preços e indicadores observados
/config                 Perfil, tema, ocultar valores
/config/contas · /config/cartoes · /config/categorias · /config/estabelecimentos
/config/recorrentes     Salário base, contas fixas, planejamentos anuais
/config/metas           Meta de investimento + alocação por classe + pesos/tetos por ativo
/config/importar · /config/importacoes · /config/exportar
```

O mês selecionado fica na URL (compartilhável, botão voltar funciona) e persiste entre telas de Finanças.

## Telas

### Login / Cadastro

Tela única centralizada, logo, campos username e senha, "Criar conta" (pede código de convite quando `SIGNUP_MODE=invite`). Mostrar/ocultar senha. Erros inline.

### Início

1. Saudação + ocultar valores.
2. Card **Sobra prevista do mês** (herói) com Entradas · Saídas · Meta e progresso "Investido R$ X de R$ Y".
3. Card **Patrimônio** (herói secundário): total, ganho real no ano (R$ e %).
4. Atalhos: + Gasto, Simular aporte, Fazer balanço (destacado se o balanço do mês não existe).
5. Próximos vencimentos (7 dias).
6. Parcelamentos: total para quitar tudo.
7. Últimos 5 lançamentos.
8. Notícias da carteira (3).
   Desktop: grade 2–3 colunas.

### Finanças — Mês

- Header: `MonthSwitcher`, ocultar valores.
- Resumo fixo compacto: Entradas · Saídas · Sobra.
- Filtros (chips): Todos · Receitas · Despesas · Previstos · Cartão X · Categoria.
- Lista agrupada por dia (ou por categoria — alternável), cada linha: ícone da categoria, descrição, estabelecimento · forma de pagamento · "3/12" se parcela, valor; status previsto em texto secundário com bolinha vazia; toque → editar; swipe → pagar/excluir.
- Seções colapsáveis: **Receitas**, **Fixas**, **Parcelas do mês**, **Planejamentos**, **Variáveis**.
- Desktop: tabela com colunas Data · Descrição · Categoria · Forma · Conta/Cartão · Estabelecimento · Natureza · Status · Valor, ordenável, edição inline e em lote.

### Finanças — Dashboard

Os 10 blocos do doc 04 §8. Mobile em coluna, desktop em grade. Seletor de período: mês · 3 meses · ano.

### Parcelamentos

- Topo: **"Para quitar tudo: R$ 1.300,00"** + "Compromisso mensal: R$ 250/mês" + gráfico de barras dos próximos 12 meses ("livre em ago/2027").
- Cards: nome, estabelecimento, cartão, barra de progresso, "2/12", "Pago R$ 333 de R$ 2.000", "Falta R$ 1.667", "Termina em out/2027". Filtro ativos/finalizados.
- Detalhe: tabela das parcelas (competência, valor, status), ações Editar · Quitar antecipado · Cancelar.

### Fatura do cartão

Cartão visual no topo (cor da conta), total, fecha em / vence em, status, lista dos lançamentos, "Marcar fatura como paga", navegação entre meses.

### Projeção 12 meses

Gráfico + tabela mês a mês: entradas, fixas, parcelas, planejamentos, meta, sobra. Meses negativos destacados.

### Carteira

- Herói: patrimônio, variação, hora da cotação, botão atualizar.
- `AllocationBars` atual × meta por classe.
- Lista agrupada por classe (expansível): ativo, qtd, PM, valor, resultado %, peso. Alternar **Por classe / Por corretora / Por ticker**.
- Desktop: tabela com todas as colunas + painel de detalhe à direita.

### Detalhe do ativo

Doc 05 §9. Segmented control no mobile: Resumo · Operações · Proventos · Preços · Notícias.

### Proventos

Barras 12 meses, total do ano, média, lista por mês, botão **Lançar proventos do mês** (RC-41).

### Aporte (simulador)

Mobile, de cima para baixo:

1. **Valor do aporte** (MoneyInput) e chip "usar meta do mês".
2. **Divisão por classe**: linhas com % editável e R$ calculado, total 100% validado, botão "Rebalancear".
3. **Restante total** grande + barra.
4. Por classe (cards expansíveis): "FIIs — R$ 480 · gasto R$ 380 · **faltam R$ 100**" (chip de cor RA-14); dentro, itens simulados com ± cota, peso antes → depois, alerta de concentração; "+ Adicionar ativo".
5. Gráfico Antes × Depois × Meta.
6. Barra de ação fixa no rodapé: **Salvar** · **Efetivar compras**.
   Desktop: 2 colunas — esquerda carrinho, direita gráficos e resumo fixos.

### Balanço

- Lista: cards por mês (total, ganho real, %, aportes), CTA "Gravar balanço de <mês>".
- Formulário (doc 07 §1): agrupado por classe › corretora, linhas editáveis com qtd/preço/valor/DY/P-VP, resumo ao vivo fixo no topo, salvar rascunho / fechar.
- Evolução: gráficos + tabela anual.
- Preços observados: tabela ordenável (RB-30) com "Adicionar à simulação".

### Configurações › Metas

- Meta de investimento: valor fixo ou %.
- Alocação por classe: sliders/inputs com soma = 100% e donut ao vivo; teto por classe opcional.
- Por ativo: peso alvo dentro da classe e teto na carteira.

### Configurações › Recorrentes

Lista de modelos (Salário R$ 6.000 todo dia 5; Aluguel; Netflix; Aniversário R$ 200 todo outubro). Criar/editar com "aplicar a partir de".

## Fluxos críticos (cobrir com Playwright)

1. Cadastro com convite → login → onboarding (cria contas, cartão, salário base, metas) → Início.
2. Lançar gasto no crédito em ≤ 3 toques após abrir o sheet.
3. Criar parcelamento 12× já na parcela 2 → ver no totalizador.
4. Editar salário de um mês sem afetar o seguinte.
5. Simular aporte, estourar uma classe, ajustar, efetivar → posição atualizada.
6. Gravar balanço do mês → rentabilidade real calculada.
7. Importar CSV de lançamentos → desfazer importação.

## Onboarding (primeiro acesso)

Passos curtos e puláveis: 1) contas/bancos que usa, 2) cartões (fechamento/vencimento), 3) salário base, 4) meta de investimento, 5) classes e % alvo, 6) "Importar minhas planilhas?" → wizard.
