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

export const IMPORT_EXAMPLES = {
  monthly_sheet: MONTHLY_SHEET_EXAMPLE,
  transactions: TRANSACTIONS_EXAMPLE,
  installments: INSTALLMENTS_EXAMPLE,
} as const
