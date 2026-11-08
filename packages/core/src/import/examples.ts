/**
 * Planilhas de exemplo de cada tipo de importação (docs/08 › Templates oficiais): o que o
 * importador "espera". O navegador gera o .xlsx a partir destas grades; os testes garantem
 * que o próprio importador lê cada exemplo sem erro.
 */

export type ExampleCell = string | number | null

export interface ExampleSheet {
  name: string
  rows: ExampleCell[][]
  /** Largura das colunas (em caracteres), para o .xlsx abrir legível. */
  widths?: number[]
}

export interface ImportExample {
  fileName: string
  sheets: ExampleSheet[]
}

const instructions = (rows: [string, string, string][]): ExampleSheet => ({
  name: 'Instruções',
  rows: [['coluna', 'obrigatória', 'como preencher'], ...rows],
  widths: [22, 14, 90],
})

/** Template "Lançamentos": uma linha por gasto ou receita. */
export const TRANSACTIONS_EXAMPLE: ImportExample = {
  fileName: 'orla-exemplo-lancamentos.xlsx',
  sheets: [
    {
      name: 'Lançamentos',
      widths: [12, 12, 10, 14, 24, 12, 16, 16, 12, 12, 20, 10, 20],
      rows: [
        [
          'data',
          'competencia',
          'tipo',
          'natureza',
          'descricao',
          'valor',
          'categoria',
          'forma_pagamento',
          'conta',
          'cartao',
          'estabelecimento',
          'status',
          'observacao',
        ],
        [
          '05/11/2026',
          '',
          'receita',
          'fixa',
          'Salário',
          '6.000,00',
          'Salário',
          'transferencia',
          'Nubank',
          '',
          '',
          'pago',
          '',
        ],
        [
          '10/11/2026',
          '',
          'despesa',
          'fixa',
          'Aluguel',
          '1.500,00',
          'Moradia',
          'boleto',
          'Nubank',
          '',
          '',
          'previsto',
          '',
        ],
        [
          '12/11/2026',
          '',
          'despesa',
          'variavel',
          'Mercado',
          '234,50',
          'Mercado',
          'credito',
          '',
          'Nubank',
          'Mercado Bom Preço',
          'previsto',
          '',
        ],
        [
          '14/11/2026',
          '',
          'despesa',
          'variavel',
          'Farmácia',
          '38,99',
          'Saúde',
          'pix',
          'Nubank',
          '',
          'Farmácia Central',
          'pago',
          '',
        ],
        [
          '15/11/2026',
          '12/2026',
          'despesa',
          'planejamento',
          'Presente de Natal',
          '300,00',
          'Presentes',
          '',
          '',
          '',
          '',
          'previsto',
          'Entra em dezembro',
        ],
        [
          '20/11/2026',
          '',
          'receita',
          'extra',
          'Venda do celular antigo',
          '800,00',
          'Extra',
          'pix',
          'Nubank',
          '',
          '',
          'pago',
          '',
        ],
      ],
    },
    instructions([
      ['data', 'sim', 'dd/mm/aaaa (também aceita dd/mm/aa e AAAA-MM-DD)'],
      [
        'competencia',
        'não',
        'mm/aaaa: o mês em que entra no resumo. Vazio = pela data (ou pela fatura, no crédito)',
      ],
      ['tipo', 'não', 'receita ou despesa (vazio = despesa)'],
      [
        'natureza',
        'não',
        'fixa, variavel, planejamento ou extra. Compras parceladas vão no exemplo de Parcelamentos',
      ],
      ['descricao', 'sim', 'texto livre'],
      ['valor', 'sim', '1.234,56 ou R$ 1.234,56 (negativo vira positivo)'],
      ['categoria', 'não', 'nome da categoria; se não existir, o Orla cria'],
      ['forma_pagamento', 'não', 'pix, debito, credito, dinheiro, boleto, transferencia ou outro'],
      ['conta', 'não', 'nome da conta/banco; se não existir, o Orla cria'],
      ['cartao', 'no crédito', 'nome do cartão, já cadastrado em Configurações › Cartões'],
      ['estabelecimento', 'não', 'onde comprou / quem recebeu'],
      [
        'status',
        'não',
        'previsto ou pago (vazio: gastos do dia pagos; fixas, planejamentos e crédito previstos)',
      ],
      ['observacao', 'não', 'texto livre'],
    ]),
  ],
}

/** Template "Parcelamentos": uma linha por compra parcelada. */
export const INSTALLMENTS_EXAMPLE: ImportExample = {
  fileName: 'orla-exemplo-parcelamentos.xlsx',
  sheets: [
    {
      name: 'Parcelamentos',
      widths: [12, 22, 18, 14, 12, 12, 13, 12, 13, 16],
      rows: [
        [
          'data_compra',
          'descricao',
          'estabelecimento',
          'categoria',
          'cartao',
          'valor_total',
          'valor_parcela',
          'qtd_parcelas',
          'parcela_atual',
          'observacao',
        ],
        ['10/03/2026', 'Notebook', 'Loja X', 'Compras', 'Nubank', '5.673,10', '', '10', '9', ''],
        ['01/09/2026', 'Sofá', 'Móveis Y', 'Moradia', '', '', '250,00', '8', '3', 'Carnê da loja'],
        ['20/10/2026', 'Fone de ouvido', 'Loja Z', 'Compras', 'Nubank', '330,90', '', '6', '', ''],
      ],
    },
    instructions([
      ['data_compra', 'sim', 'dd/mm/aaaa'],
      ['descricao', 'sim', 'texto livre'],
      ['estabelecimento', 'não', 'onde comprou'],
      ['categoria', 'não', 'nome da categoria'],
      ['cartao', 'não', 'nome do cartão; vazio = boleto/carnê'],
      ['valor_total', 'um dos dois', 'valor total da compra'],
      ['valor_parcela', 'um dos dois', 'valor de cada parcela'],
      ['qtd_parcelas', 'sim', 'número de parcelas (1 a 120)'],
      [
        'parcela_atual',
        'não',
        'em qual parcela você está NESTE mês: as anteriores entram como pagas. Vazio = começa pela compra',
      ],
      ['observacao', 'não', 'texto livre'],
    ]),
  ],
}

const EXPENSE_HEADER: ExampleCell[] = [
  'DESCRIÇÃO DESPESA',
  'VALOR',
  'TIPO',
  'DATA',
  'DATA PAGO',
  'BANCO/QUEM',
  'QTD. PARCELAS',
  'PARCELA',
  'VALOR PAGO',
  'VALOR TOTAL',
]
const INCOME_HEADER: ExampleCell[] = [
  'DESCRIÇÃO ENTRADA',
  null,
  null,
  null,
  null,
  null,
  'VALOR ENTRADA',
]
const income = (description: string, value: number): ExampleCell[] => [
  description,
  null,
  null,
  null,
  null,
  null,
  value,
]

/** Formato "planilha mensal": uma aba por ano, um bloco por mês. */
export const MONTHLY_SHEET_EXAMPLE: ImportExample = {
  fileName: 'orla-exemplo-planilha-mensal.xlsx',
  sheets: [
    {
      name: 'FINANÇAS - 2026',
      widths: [34, 10, 14, 12, 12, 14, 14, 9, 12, 12],
      rows: [
        ['JANEIRO'],
        INCOME_HEADER,
        income('SALÁRIO', 6000),
        income('VALOR MÊS ANTERIOR', 250),
        income('PRESENTE VÓ', 100),
        EXPENSE_HEADER,
        ['ALUGUEL', 1500, 'FIXO', '05/01/2026', '05/01/2026', 'PAI'],
        ['INTERNET', 99.9, 'FIXO', '10/01/2026', '10/01/2026', 'NUBANK'],
        ['STREAMING', 55.9, 'FIXO', '12/01/2026', '12/01/2026', 'NUBANK'],
        [
          'NOTEBOOK',
          567.31,
          'PARCELA',
          '15/12/2025',
          '05/01/2026',
          'NUBANK',
          10,
          1,
          567.31,
          5673.1,
        ],
        ['MERCADO', 234.5, 'CRÉDITO', '20/12/2025', '05/01/2026', 'NUBANK'],
        ['FARMÁCIA', 38.99, 'PIX', '14/01/2026', '14/01/2026', 'NUBANK'],
        ['COTAS BANCO', 30, 'DÉBITO', '20/01/2026', '20/01/2026', 'AILOS'],
        ['PRESENTE ANIVERSÁRIO MÃE', 200, 'PLANEJAMENTO', '25/01/2026', '', 'NUBANK'],
        ['TOTAL GASTOS', 2726.6],
        ['VALOR ECONOMIZAR', 1000],
        ['SOBROU', 2623.4],
        [],
        ['FEVEREIRO'],
        INCOME_HEADER,
        income('SALÁRIO', 6000),
        EXPENSE_HEADER,
        ['ALUGUEL', 1500, 'FIXO', '05/02/2026', '05/02/2026', 'PAI'],
        ['INTERNET', 99.9, 'FIXO', '10/02/2026', '10/02/2026', 'NUBANK'],
        [
          'NOTEBOOK',
          567.31,
          'PARCELA',
          '15/12/2025',
          '05/02/2026',
          'NUBANK',
          10,
          2,
          1134.62,
          5673.1,
        ],
        ['ABASTECIDA CARRO', 245.37, 'CRÉDITO', '08/02/2026', '', 'NUBANK'],
        ['TOTAL GASTOS', 2412.58],
        ['VALOR ECONOMIZAR', 1200],
        ['SOBROU', 2387.42],
      ],
    },
    {
      name: 'Instruções',
      widths: [26, 100],
      rows: [
        ['parte', 'como preencher'],
        [
          'Aba',
          'Uma aba por ano. O ano vem do nome da aba (ex.: "FINANÇAS - 2026"); dá para trocar na importação.',
        ],
        [
          'Título do mês',
          'Na coluna A, sozinho na linha: JANEIRO, FEVEREIRO... Depois de DEZEMBRO, o ano vira.',
        ],
        [
          'Entradas',
          'Linha "DESCRIÇÃO ENTRADA" e, abaixo, uma entrada por linha (descrição na coluna A, valor na coluna "VALOR ENTRADA"). SALÁRIO vira receita fixa; as demais, receita extra. Valor 0 é ignorado.',
        ],
        [
          'Despesas',
          'Linha "DESCRIÇÃO DESPESA | VALOR | TIPO | DATA | DATA PAGO | BANCO/QUEM | QTD. PARCELAS | PARCELA | VALOR PAGO | VALOR TOTAL" e, abaixo, uma despesa por linha.',
        ],
        [
          'TIPO',
          'FIXO (conta fixa), CRÉDITO (compra no cartão), DÉBITO, PIX, PLANEJAMENTO ou PARCELA.',
        ],
        [
          'DATA',
          'Data da compra/conta (dd/mm/aaaa). Compras no crédito podem ser do mês anterior: entram no mês do bloco.',
        ],
        ['DATA PAGO', 'Preenchida (data, banco ou "QUITADO") = pago. Vazia = previsto.'],
        [
          'BANCO/QUEM',
          'Cartão, conta ou pessoa. Na importação você diz o que cada nome é (ex.: NUBANK = cartão, PAI = pessoa).',
        ],
        [
          'Parcelas',
          'Preencha QTD. PARCELAS e PARCELA (em qual parcela está naquele mês). As linhas da mesma compra em vários meses viram um parcelamento só. "(QUITEI)" na descrição ou "QUITADO" em DATA PAGO = quitação antecipada.',
        ],
        [
          'VALOR ECONOMIZAR',
          'Quanto você guardou/investiu no mês: vira a meta investida do mês (aba Investimento).',
        ],
        ['TOTAL GASTOS / SOBROU', 'Podem ficar: são ignorados (o Orla calcula sozinho).'],
        ['Colunas à direita', 'Anotações depois da coluna "VALOR TOTAL" são ignoradas.'],
      ],
    },
  ],
}

/** Template "Ativos". */
export const ASSETS_EXAMPLE: ImportExample = {
  fileName: 'orla-exemplo-ativos.xlsx',
  sheets: [
    {
      name: 'Ativos',
      widths: [16, 10, 26, 14, 12, 14, 12, 16, 16],
      rows: [
        [
          'classe',
          'ticker',
          'nome',
          'corretora',
          'indexador',
          'taxa',
          'vencimento',
          'peso_meta_classe',
          'teto_carteira',
        ],
        ['FIIs', 'MXRF11', 'Maxi Renda', 'Rico', '', '', '', '20', '10'],
        ['Ações', 'ITSA4', 'Itaúsa PN', 'Rico', '', '', '', '', ''],
        [
          'Renda Fixa',
          '',
          'Tesouro Selic 2031',
          'Rico',
          'SELIC',
          'Selic + 0,1%',
          '01/03/2031',
          '',
          '',
        ],
        ['Renda Fixa', '', 'Caixinha Nubank', 'Nubank', 'CDI', '100% CDI', '', '', ''],
      ],
    },
    instructions([
      [
        'classe',
        'sim',
        'nome da classe no Orla: Renda Fixa / Reserva, FIIs, Ações, Exterior, Cripto (ou as suas)',
      ],
      ['ticker', 'bolsa', 'código da B3 (ITSA4, MXRF11). Vazio = renda fixa (use o nome)'],
      ['nome', 'renda fixa', 'nome livre (Tesouro Selic 2031, CDB Nubank 100% CDI)'],
      ['corretora', 'não', 'nome da conta/corretora; se não existir, o Orla cria'],
      ['indexador', 'não', 'renda fixa: CDI, IPCA, SELIC, PRE'],
      ['taxa', 'não', 'renda fixa: texto livre (100% CDI, IPCA + 6,5%)'],
      ['vencimento', 'não', 'renda fixa: dd/mm/aaaa'],
      ['peso_meta_classe', 'não', 'peso desejado do ativo dentro da classe, em %'],
      ['teto_carteira', 'não', 'teto do ativo na carteira toda, em % (alerta de concentração)'],
    ]),
  ],
}

/** Template "Operações". */
export const TRADES_EXAMPLE: ImportExample = {
  fileName: 'orla-exemplo-operacoes.xlsx',
  sheets: [
    {
      name: 'Operações',
      widths: [12, 22, 12, 14, 12, 10, 8, 12],
      rows: [
        [
          'data',
          'ticker_ou_nome',
          'corretora',
          'tipo',
          'quantidade',
          'preco',
          'taxas',
          'valor_total',
        ],
        ['01/01/2026', 'ITSA4', 'Rico', 'compra', '4', '7,00', '', '28,00'],
        ['18/03/2026', 'MXRF11', 'Rico', 'compra', '10', '9,73', '0,10', ''],
        ['20/06/2026', 'ITSA4', 'Rico', 'venda', '2', '14,50', '', ''],
        ['05/02/2026', 'Tesouro Selic 2031', 'Rico', 'aplicacao', '', '', '', '2.377,18'],
        ['10/04/2026', 'ITSA4', 'Rico', 'desdobramento', '2', '', '', ''],
      ],
    },
    instructions([
      ['data', 'sim', 'dd/mm/aaaa'],
      ['ticker_ou_nome', 'sim', 'ticker (bolsa) ou o nome do ativo de renda fixa'],
      ['corretora', 'não', 'separa o mesmo ticker em corretoras diferentes'],
      [
        'tipo',
        'não',
        'compra, venda, bonificacao, desdobramento, grupamento, subscricao, aplicacao, resgate, ajuste (posição informada: quantidade + preço médio) (vazio = compra)',
      ],
      [
        'quantidade',
        'sim*',
        'número de cotas. Desdobramento/grupamento: a proporção (1:10 → 10). Renda fixa: pode ficar vazio',
      ],
      ['preco', 'sim*', 'preço unitário. Bonificação: custo atribuído por ação (pode ser 0)'],
      ['taxas', 'não', 'corretagem e emolumentos'],
      [
        'valor_total',
        'não',
        'o valor da nota; vazio = quantidade × preço + taxas. Renda fixa: o valor aplicado/resgatado',
      ],
    ]),
  ],
}

/** Template "Proventos". */
export const DIVIDENDS_EXAMPLE: ImportExample = {
  fileName: 'orla-exemplo-proventos.xlsx',
  sheets: [
    {
      name: 'Proventos',
      widths: [16, 10, 14, 10],
      rows: [
        ['data_pagamento', 'ticker', 'tipo', 'valor'],
        ['14/10/2026', 'MXRF11', 'rendimento', '5,40'],
        ['14/10/2026', 'HFOF11', 'rendimento', '4,68'],
        ['01/10/2026', 'ITSA4', 'jcp', '0,46'],
        ['20/08/2026', 'TAEE11', 'dividendo', '4,15'],
      ],
    },
    instructions([
      ['data_pagamento', 'sim', 'dd/mm/aaaa'],
      [
        'ticker',
        'sim',
        'o ativo precisa estar cadastrado (ou ser criado pela importação de operações)',
      ],
      ['tipo', 'não', 'dividendo, jcp, rendimento, juros ou outro (vazio = dividendo)'],
      ['valor', 'sim', 'valor líquido recebido'],
    ]),
  ],
}

const PORTFOLIO_TITLE: ExampleCell[] = [
  'TOTAL %:',
  null,
  'FIIS - 30%',
  null,
  null,
  null,
  'AÇÕES - 25%',
  null,
  null,
  null,
  'RENDA FIXA - 45%',
]
const PORTFOLIO_HEADER: ExampleCell[] = [
  null,
  null,
  'DESC/DATA',
  'QTDE',
  'VALOR',
  'TOTAL',
  'DESC/DATA',
  'QTDE',
  'VALOR',
  'TOTAL',
  'DESC/DATA',
  'VALOR',
]

/** Planilha da carteira: aportes por mês, balanço mensal e proventos (formato do dono). */
export const PORTFOLIO_SHEET_EXAMPLE: ImportExample = {
  fileName: 'orla-exemplo-planilha-carteira.xlsx',
  sheets: [
    {
      name: 'AÇÕES - 2026',
      widths: [12, 14, 30, 8, 10, 10, 26, 8, 10, 10, 34, 10],
      rows: [
        PORTFOLIO_TITLE,
        PORTFOLIO_HEADER,
        [null, 'JANEIRO'],
        [null, 'FEVEREIRO', ...PORTFOLIO_HEADER.slice(2)],
        [
          null,
          null,
          'MXRF11 - 18/02/2026',
          10,
          9.73,
          97.3,
          'ITSA4 - 18/02/2026',
          4,
          13.46,
          53.84,
          'TESOURO SELIC 2031 - 18/02/2026',
          370.67,
        ],
        [
          null,
          null,
          'HFOF11 - 18/02/2026',
          10,
          6.84,
          68.4,
          null,
          null,
          null,
          null,
          'CAIXINHA NUBANK - 24/02/2026',
          236.63,
        ],
        [null, 'MARÇO', ...PORTFOLIO_HEADER.slice(2)],
        [
          null,
          null,
          null,
          null,
          null,
          null,
          'TAEE11 - 18/03/2026',
          2,
          43,
          86,
          'CAIXINHA NUBANK - 23/03/2026',
          200,
        ],
        [],
        [null, 'BALANÇO MENSAL(DEPOIS APORTE)', null, null, null, null, null, null, 'PROVENTOS'],
        [
          null,
          'MÊS',
          'DESC',
          'DATA',
          'PREÇO/ATIVO',
          'VALOR TOTAL',
          'QTDE ATIVOS',
          null,
          'MÊS',
          'DESC',
          'DATA',
          'VALOR',
        ],
        [
          null,
          'JANEIRO',
          'TESOURO SELIC 2031',
          '31/01/2026',
          2377.18,
          2377.18,
          0,
          null,
          'JANEIRO',
          'MXRF11',
          '14/01/2026',
          4.4,
        ],
        [
          null,
          null,
          'MXRF11',
          '31/01/2026',
          9.8,
          431.2,
          44,
          null,
          null,
          'ITSA4',
          '02/01/2026',
          0.46,
        ],
        [null, null, 'ITSA4', '31/01/2026', 14.1, 324.3, 23],
        [
          null,
          'FEVEREIRO',
          'TESOURO SELIC 2031',
          '28/02/2026',
          2791.92,
          2791.92,
          0,
          null,
          'FEVEREIRO',
          'MXRF11',
          '14/02/2026',
          4.4,
        ],
        [
          null,
          null,
          'CAIXINHA NUBANK',
          '28/02/2026',
          237.48,
          237.48,
          0,
          null,
          null,
          'HFOF11',
          '14/02/2026',
          4.08,
        ],
        [null, null, 'MXRF11', '28/02/2026', 9.82, 530.28, 54],
        [null, null, 'HFOF11', '28/02/2026', 6.8, 68, 10],
        [null, null, 'ITSA4', '28/02/2026', 13.98, 377.46, 27],
        [],
        [null, 'CONTROLE % PATRIMÔNIO + APORTE'],
      ],
    },
    {
      name: 'Instruções',
      widths: [26, 100],
      rows: [
        ['parte', 'como preencher'],
        [
          'Título',
          'Uma linha com as classes e as metas: "FIIS - 30%", "AÇÕES - 25%", "RENDA FIXA - 45%" (viram as metas de alocação).',
        ],
        [
          'Aportes',
          'Um bloco por mês (nome do mês na coluna B). FIIs nas colunas C–F e Ações em G–J: "TICKER - dd/mm/aaaa" | QTDE | VALOR | TOTAL. Renda fixa em K–L: "NOME - dd/mm/aaaa" | VALOR.',
        ],
        [
          'Balanço mensal',
          'Depois da linha "BALANÇO MENSAL": mês (B), ativo (C), data (D), preço (E), valor total (F), quantidade (G). Renda fixa com quantidade 0.',
        ],
        [
          'Posição inicial',
          'O que você já tinha antes dos aportes sai do 1º balanço (quantidade − compras até ele). Na importação, você confere o preço médio de cada um.',
        ],
        [
          'Conciliação',
          'Se um balanço mostrar mais ou menos cotas do que as compras explicam, o Orla cria um ajuste naquela data (você confere).',
        ],
        [
          'Último balanço',
          'Dá o preço de cada ativo e o saldo de cada renda fixa até a próxima cotação.',
        ],
        ['Proventos', 'Ao lado do balanço, colunas I–L: mês, ativo, data, valor.'],
        [
          'Renda fixa',
          'Nomes diferentes do mesmo investimento (ex.: "TESOURO 2031" no aporte e "SELIC 2031" no balanço) são juntados na importação.',
        ],
        ['CONTROLE ...', 'Daí para baixo é ignorado.'],
      ],
    },
  ],
}

export const IMPORT_EXAMPLES = {
  monthly_sheet: MONTHLY_SHEET_EXAMPLE,
  transactions: TRANSACTIONS_EXAMPLE,
  installments: INSTALLMENTS_EXAMPLE,
  assets: ASSETS_EXAMPLE,
  trades: TRADES_EXAMPLE,
  dividends: DIVIDENDS_EXAMPLE,
  portfolio_sheet: PORTFOLIO_SHEET_EXAMPLE,
} as const
