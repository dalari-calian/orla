# 08 — Importação, exportação e entrada manual

## Princípio

Três caminhos para os dados entrarem, todos editáveis depois:

1. **Manual** (formulários rápidos — o principal no dia a dia).
2. **Importação de planilha** (.xlsx / .csv) — para trazer o histórico das planilhas atuais.
3. **Lançamento rápido por texto** (base para o bot de WhatsApp — fase futura).

## 1. Importação

### Fluxo (wizard de 4 passos, desktop e mobile)

1. **Escolher o tipo**: Lançamentos · Parcelamentos · Ativos · Operações · Proventos · Balanços.
2. **Enviar arquivo**: `.xlsx`, `.xls`, `.csv` (separador `;` ou `,` detectado; encoding UTF-8 e Latin-1). Em .xlsx, escolher a aba. O parse acontece **no navegador** (SheetJS/Papaparse); só o resultado vai para a API.
3. **Mapear colunas**: o sistema sugere o mapeamento por nome de coluna (dicionário de sinônimos pt-BR: "Valor", "Vlr", "Preço"…; "Forma de pagamento", "Pagamento"…). Usuário ajusta; o mapeamento é salvo e reutilizado na próxima vez.
4. **Pré-visualizar e validar**: tabela com cada linha e erros/avisos por célula (data inválida, valor vazio, ticker desconhecido, categoria nova). Opções: criar categorias/contas/estabelecimentos novos automaticamente; pular linhas com erro. **Confirmar** → grava em transação única.

### Regras

- **RI-01** Parsing de números pt-BR: `1.234,56`, `R$ 1.234,56`, `-50`, `(50,00)`. Datas: `dd/mm/aaaa`, `dd/mm/aa`, ISO, serial do Excel.
- **RI-02** Detecção de duplicados: mesma data + valor + descrição (normalizada) já existente → marcado como "provável duplicado", desmarcado por padrão.
- **RI-03** Toda importação gera um `import_job`; tela "Histórico de importações" com botão **Desfazer** (soft delete de tudo que o job criou).
- **RI-04** Parcelamentos importados aceitam "parcela atual" e "valor pago até agora" → aplica RF-43.
- **RI-05** Operações importadas recalculam posição/PM ao final.
- **RI-06** Balanços importados: uma linha por ativo por data → agrupa por mês e cria um `balance` fechado por mês (aportes do período calculados conforme RB-11).
- **RI-07** Limite: 10 mil linhas por arquivo (enviar em lotes de 500 para a API).

### Templates oficiais

Disponíveis para download na tela de importação (`.xlsx` com uma aba de exemplo e uma de instruções), para os três tipos: Lançamentos, Parcelamentos e **Planilha mensal** (o formato de blocos por mês). Os exemplos ficam em `packages/core/src/import/examples.ts` e os testes garantem que o próprio importador lê cada um sem erro. Colunas:

**Lançamentos**: `data; competencia (mm/aaaa, opcional); tipo (receita|despesa); natureza (fixa|variavel|planejamento|extra); descricao; valor; categoria; forma_pagamento (pix|debito|credito|dinheiro|boleto|transferencia); conta; cartao; estabelecimento; status (previsto|pago); observacao`

**Parcelamentos**: `data_compra; descricao; estabelecimento; categoria; cartao; valor_total; valor_parcela; qtd_parcelas; parcela_atual; observacao`

**Ativos**: `classe; ticker; nome; corretora; indexador; taxa; vencimento; peso_meta_classe; teto_carteira`

**Operações**: `data; ticker_ou_nome; corretora; tipo (compra|venda|bonificacao|desdobramento); quantidade; preco; taxas; valor_total`

**Proventos**: `data_pagamento; ticker; tipo (dividendo|jcp|rendimento); valor; valor_por_cota; quantidade_base`

**Balanços**: `data; ticker_ou_nome; corretora; quantidade; preco; valor; dy; pvp`

> **Tarefa para o dono do projeto:** exportar as planilhas atuais e colocar uma cópia anonimizada em `docs/referencias/planilhas/` para o Claude Code ajustar os sinônimos de coluna ao formato real.

### Planilha mensal do dono (formato "ORÇAMENTO")

Além dos templates, o wizard tem o tipo **Minha planilha mensal**, que lê o formato real das planilhas atuais (uma aba por ano, um bloco por mês). Decisões:

- **Blocos**: título do mês sozinho na coluna A (JANEIRO…DEZEMBRO; depois de dezembro o ano vira). Ano pelo nome da aba ("FINANÇAS - 2026"), editável no passo 2. Colunas à direita da tabela (anotações) são ignoradas.
- **Entradas** (entre "DESCRIÇÃO ENTRADA" e "DESCRIÇÃO DESPESA"): "SALÁRIO" vira receita **fixa**; as demais, **extra** — inclusive "VALOR MÊS ANTERIOR" (decisão do dono). Valor 0 é ignorado. Meses até o atual entram recebidos; depois, previstos.
- **Despesas**: TIPO FIXO → fixa · CRÉDITO → variável no crédito · DÉBITO/PIX → variável · PLANEJAMENTO → planejamento. Competência = mês do bloco; a DATA é mantida se cair no mês ou até 2 meses antes (compras do crédito), senão vira o mesmo dia no mês do bloco. "DATA PAGO" preenchida = pago.
- **BANCO/QUEM**: no passo 3 o usuário diz o que cada valor é — **cartão** (compras no crédito e contas fixas vão para a fatura), **conta**, **pessoa/loja** (estabelecimento) ou ignorar. Crédito sem cartão associado entra como forma "outro", com aviso.
- **Parcelas** (QTD. PARCELAS > 1): as linhas de todos os meses com a mesma descrição (sem "(QUITEI)") e nº de parcelas viram **um parcelamento**. 1ª parcela = mês − (PARCELA − 1); pagas até a maior PARCELA marcada como paga; "QUITADO" vira quitação antecipada naquele mês. Sem valor nenhum na planilha → ignorado.
- **"VALOR ECONOMIZAR"** vira a **meta investida do mês** (meta = investido = valor) — decisão do dono. "TOTAL GASTOS" e "SOBROU" são ignorados.

O SheetJS (0.20.3, versão oficial do site deles — a do npm tem falhas conhecidas) só é carregado nas telas de importar/exportar.

## 2. Exportação e backup

- **RE-01** Exportar por entidade em CSV (pt-BR, `;`) ou XLSX, com filtro de período.
- **RE-02** **Backup completo** em JSON (todas as tabelas do usuário, versão do schema) e **restaurar** a partir dele (substituir ou mesclar).
- **RE-03** Backup automático do banco inteiro semanal via GitHub Actions (`pg_dump` criptografado com `age`/GPG) — porque o free do Neon tem janela de restauração curta.

## 3. Entrada manual (UX)

- **RM-01** Botão **+** central sempre acessível (tab bar no mobile, atalho `N` no desktop) abre um _sheet_ com tipo: Despesa · Receita · Parcelado · Planejamento · Compra de ativo · Provento · Aporte.
- **RM-02** Formulário de despesa em 1 tela: valor grande no topo (teclado numérico, máscara R$), descrição, categoria (chips das mais usadas), forma de pagamento (segmented control), conta/cartão, estabelecimento (autocomplete), data (hoje por padrão). Campos avançados recolhidos.
- **RM-03** Memória: ao escolher um estabelecimento já usado, preenche categoria, forma de pagamento e cartão do último lançamento dele.
- **RM-04** Tudo editável e excluível (swipe no mobile, menu no desktop), com **Desfazer** em toast por 5 s.
- **RM-05** Edição em lote (desktop): selecionar várias linhas → mudar categoria/status/cartão.

## 4. Lançamento rápido por texto (preparação para WhatsApp)

- **RQ-01** Endpoint `POST /api/quick-entry` recebe texto livre: _"gastei 45,90 no ifood no crédito nubank"_, _"recebi 300 presente"_, _"tênis 600 em 3x cartão itaú"_.
- **RQ-02** Parser determinístico no core (regex + dicionário de estabelecimentos/cartões/contas do usuário) extrai valor, forma, cartão, parcelas, estabelecimento; devolve um **rascunho** + confiança. Na v1 usado por um campo "digite rápido" no app; no futuro o bot chama o mesmo endpoint (com token por usuário) e pede confirmação.
- **RQ-03** (Futuro) fallback com LLM quando o parser não tiver confiança.
