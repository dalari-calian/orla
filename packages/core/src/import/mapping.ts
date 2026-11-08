/**
 * Mapeamento de colunas (docs/08, passo 3): campos de cada tipo de importação, sinônimos
 * pt-BR e leitura dos valores de enumeração ("crédito", "fixa", "pago"...).
 */
import type { ImportPaymentMethod } from './drafts.ts'
import { normalizeText } from './text.ts'

export interface ImportField {
  key: string
  label: string
  required: boolean
  /** Nomes de coluna aceitos (comparados sem acento/maiúsculas). */
  synonyms: readonly string[]
}

/** Template "Lançamentos" (docs/08 › Templates oficiais). */
export const TRANSACTION_FIELDS: readonly ImportField[] = [
  {
    key: 'data',
    label: 'Data',
    required: true,
    synonyms: ['data', 'dt', 'dia', 'data lancamento', 'data da compra', 'data compra', 'date'],
  },
  {
    key: 'competencia',
    label: 'Competência',
    required: false,
    synonyms: ['competencia', 'mes', 'mes competencia', 'mes de competencia', 'referencia'],
  },
  {
    key: 'tipo',
    label: 'Tipo',
    required: false,
    synonyms: ['tipo', 'receita/despesa', 'entrada/saida', 'tipo lancamento'],
  },
  {
    key: 'natureza',
    label: 'Natureza',
    required: false,
    synonyms: ['natureza', 'classificacao', 'grupo'],
  },
  {
    key: 'descricao',
    label: 'Descrição',
    required: true,
    synonyms: [
      'descricao',
      'historico',
      'lancamento',
      'item',
      'nome',
      'descricao despesa',
      'description',
    ],
  },
  {
    key: 'valor',
    label: 'Valor',
    required: true,
    synonyms: ['valor', 'vlr', 'valor r$', 'valor (r$)', 'preco', 'montante', 'total', 'amount'],
  },
  { key: 'categoria', label: 'Categoria', required: false, synonyms: ['categoria', 'category'] },
  {
    key: 'forma_pagamento',
    label: 'Forma de pagamento',
    required: false,
    synonyms: [
      'forma pagamento',
      'forma de pagamento',
      'pagamento',
      'forma',
      'meio de pagamento',
      'meio',
    ],
  },
  {
    key: 'conta',
    label: 'Conta',
    required: false,
    synonyms: ['conta', 'banco', 'instituicao', 'conta bancaria'],
  },
  {
    key: 'cartao',
    label: 'Cartão',
    required: false,
    synonyms: ['cartao', 'cartao de credito', 'card'],
  },
  {
    key: 'estabelecimento',
    label: 'Estabelecimento',
    required: false,
    synonyms: [
      'estabelecimento',
      'loja',
      'favorecido',
      'local',
      'quem',
      'beneficiario',
      'fornecedor',
    ],
  },
  {
    key: 'status',
    label: 'Status',
    required: false,
    synonyms: ['status', 'situacao', 'pago?', 'pago'],
  },
  {
    key: 'observacao',
    label: 'Observação',
    required: false,
    synonyms: ['observacao', 'observacoes', 'obs', 'nota', 'notas'],
  },
]

/** Template "Parcelamentos". */
export const INSTALLMENT_FIELDS: readonly ImportField[] = [
  {
    key: 'data_compra',
    label: 'Data da compra',
    required: true,
    synonyms: ['data compra', 'data da compra', 'data'],
  },
  {
    key: 'descricao',
    label: 'Descrição',
    required: true,
    synonyms: ['descricao', 'item', 'produto', 'nome'],
  },
  {
    key: 'estabelecimento',
    label: 'Estabelecimento',
    required: false,
    synonyms: ['estabelecimento', 'loja', 'local', 'quem'],
  },
  { key: 'categoria', label: 'Categoria', required: false, synonyms: ['categoria'] },
  {
    key: 'cartao',
    label: 'Cartão',
    required: false,
    synonyms: ['cartao', 'cartao de credito', 'banco'],
  },
  { key: 'valor_total', label: 'Valor total', required: false, synonyms: ['valor total', 'total'] },
  {
    key: 'valor_parcela',
    label: 'Valor da parcela',
    required: false,
    synonyms: ['valor parcela', 'valor da parcela', 'parcela valor', 'valor'],
  },
  {
    key: 'qtd_parcelas',
    label: 'Nº de parcelas',
    required: true,
    synonyms: [
      'qtd parcelas',
      'qtd. parcelas',
      'quantidade de parcelas',
      'parcelas',
      'n parcelas',
      'no parcelas',
    ],
  },
  {
    key: 'parcela_atual',
    label: 'Parcela atual',
    required: false,
    synonyms: ['parcela atual', 'parcela', 'atual'],
  },
  {
    key: 'observacao',
    label: 'Observação',
    required: false,
    synonyms: ['observacao', 'obs', 'notas'],
  },
]

/** Coluna sugerida para cada campo: índice no cabeçalho, ou `null`. */
export type ColumnMapping = Record<string, number | null>

const clean = (value: string) =>
  normalizeText(value)
    .replace(/[^a-z0-9/?$() ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Sugere o mapeamento pelos nomes das colunas: primeiro igualdade (chave, rótulo ou sinônimo),
 * depois "contém". Cada coluna é usada por no máximo um campo.
 */
export function suggestMapping(
  headers: readonly string[],
  fields: readonly ImportField[],
): ColumnMapping {
  const names = headers.map(clean)
  const used = new Set<number>()
  const mapping: ColumnMapping = {}
  const candidates = (field: ImportField) => [
    field.key.replace(/_/g, ' '),
    clean(field.label),
    ...field.synonyms.map(clean),
  ]

  for (const field of fields) {
    const index = names.findIndex((name, i) => !used.has(i) && candidates(field).includes(name))
    mapping[field.key] = index === -1 ? null : index
    if (index !== -1) used.add(index)
  }
  for (const field of fields) {
    if (mapping[field.key] !== null) continue
    const index = names.findIndex(
      (name, i) =>
        !used.has(i) &&
        name.length > 0 &&
        candidates(field).some((c) => c.length > 3 && name.includes(c)),
    )
    mapping[field.key] = index === -1 ? null : index
    if (index !== -1) used.add(index)
  }
  return mapping
}

/** "receita", "entrada", "income" → income; "despesa", "saída", "gasto" → expense. */
export function parseTypeValue(value: string): 'income' | 'expense' | null {
  const text = normalizeText(value)
  if (!text) return null
  if (/^(receita|entrada|income|recebimento|credito em conta|r)$/.test(text)) return 'income'
  if (/^(despesa|saida|gasto|expense|pagamento|d)$/.test(text)) return 'expense'
  return null
}

/** "fixa", "variável", "planejamento", "extra". `undefined` = não reconhecido. */
export function parseNatureValue(
  value: string,
): 'fixed' | 'variable' | 'planned' | 'extra' | 'installment' | null | undefined {
  const text = normalizeText(value)
  if (!text) return null
  if (/^fix[ao]s?$/.test(text)) return 'fixed'
  if (/^variave(l|is)$/.test(text)) return 'variable'
  if (/^planejament[oa]s?$/.test(text)) return 'planned'
  if (/^extras?$/.test(text)) return 'extra'
  if (/^parcela(s|do|mento)?$/.test(text)) return 'installment'
  return undefined
}

/** "pix", "débito", "crédito", "dinheiro", "boleto", "transferência"/"TED", "outro". */
export function parsePaymentMethodValue(value: string): ImportPaymentMethod | null | undefined {
  const text = normalizeText(value)
  if (!text) return null
  if (text === 'pix') return 'pix'
  if (/^(debito|cartao de debito)$/.test(text)) return 'debit'
  if (/^(credito|cartao de credito|cartao)$/.test(text)) return 'credit'
  if (/^(dinheiro|especie|cash)$/.test(text)) return 'cash'
  if (/^(boleto|carne|boleto ?\/ ?carne)$/.test(text)) return 'boleto'
  if (/^(transferencia|ted|doc|transf)$/.test(text)) return 'transfer'
  if (/^(outro|outros|outra)$/.test(text)) return 'other'
  return undefined
}

/** "pago", "realizado", "recebido", "sim" → settled; "previsto", "pendente", "não" → forecast. */
export function parseStatusValue(value: string): 'forecast' | 'settled' | null | undefined {
  const text = normalizeText(value)
  if (!text) return null
  if (/^(pago|paga|realizado|recebido|sim|s|ok|quitado|x|liquidado)$/.test(text)) return 'settled'
  if (/^(previsto|prevista|pendente|a pagar|a receber|nao|n|em aberto|aberto)$/.test(text))
    return 'forecast'
  return undefined
}
