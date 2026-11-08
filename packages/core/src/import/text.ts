/**
 * Leitura de células de planilha/CSV (docs/08 › RI-01): números e datas em pt-BR,
 * serial de data do Excel e texto normalizado para comparar nomes.
 */
import {
  daysInMonth,
  formatIsoDate,
  isIsoDate,
  type IsoDate,
  parseIsoDate,
} from '../dates/calendar.ts'
import type { Cents } from '../money/cents.ts'
import { parseBRL } from '../money/parse.ts'

/** Valor de uma célula como vem do leitor de planilha (SheetJS) ou do CSV. */
export type Cell = string | number | boolean | null | undefined

/** Minúsculas, sem acentos e com espaços simples — para comparar nomes e cabeçalhos. */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Texto da célula sem espaços nas pontas ('' para vazia). */
export function cellText(cell: Cell): string {
  if (cell === null || cell === undefined) return ''
  return String(cell).trim()
}

export type ParseResult<T> = { ok: true; value: T | null } | { ok: false; error: string }

/**
 * RI-01: valor em centavos. Aceita número (planilha, em reais) ou texto pt-BR
 * ("1.234,56", "R$ 1.234,56", "-50", "(50,00)"). Vazio → `null`.
 */
export function parseImportAmount(cell: Cell): ParseResult<Cents> {
  if (typeof cell === 'number') {
    if (!Number.isFinite(cell)) return { ok: false, error: 'Valor inválido' }
    // Planilhas guardam reais em ponto flutuante: arredonda para o centavo mais próximo.
    return { ok: true, value: Math.round(cell * 100) + 0 }
  }
  const text = cellText(cell)
  if (text === '' || text === '-') return { ok: true, value: null }
  try {
    return { ok: true, value: parseBRL(text) }
  } catch {
    return { ok: false, error: `Valor inválido: "${text}"` }
  }
}

/** Dia 0 do calendário do Excel (serial 1 = 1900-01-01, com o bug do 29/02/1900). */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30)
const DAY_MS = 86_400_000

/** Serial de data do Excel (ex.: 46023 = 2026-01-01) para `AAAA-MM-DD`. */
export function excelSerialToIsoDate(serial: number): IsoDate | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return null
  const date = new Date(EXCEL_EPOCH_UTC + Math.floor(serial) * DAY_MS)
  return formatIsoDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  })
}

function validDate(year: number, month: number, day: number): IsoDate | null {
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null
  return formatIsoDate({ year, month, day })
}

/**
 * RI-01: data em `dd/mm/aaaa`, `dd/mm/aa`, ISO (`2026-11-05`, com ou sem hora) ou serial do
 * Excel. Anos com 2 dígitos viram 20xx. Vazio → `null`.
 */
export function parseImportDate(cell: Cell): ParseResult<IsoDate> {
  if (typeof cell === 'number') {
    const value = excelSerialToIsoDate(cell)
    return value ? { ok: true, value } : { ok: false, error: 'Data inválida' }
  }
  const text = cellText(cell)
  if (text === '') return { ok: true, value: null }
  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(text)
  if (br) {
    const year = Number(br[3]) + (br[3]?.length === 2 ? 2000 : 0)
    const value = validDate(year, Number(br[2]), Number(br[1]))
    return value ? { ok: true, value } : { ok: false, error: `Data inválida: "${text}"` }
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(text)
  if (iso) {
    const value = validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
    return value ? { ok: true, value } : { ok: false, error: `Data inválida: "${text}"` }
  }
  if (/^\d+(\.\d+)?$/.test(text)) return parseImportDate(Number(text))
  return { ok: false, error: `Data inválida: "${text}" (use dd/mm/aaaa)` }
}

/** Mês `mm/aaaa`, `m/aa`, `AAAA-MM` ou uma data completa (usa o mês dela). Vazio → `null`. */
export function parseImportMonth(cell: Cell): ParseResult<`${number}-${number}`> {
  const text = typeof cell === 'number' ? '' : cellText(cell)
  if (typeof cell !== 'number' && text === '') return { ok: true, value: null }
  const short = /^(\d{1,2})[/.-](\d{2}|\d{4})$/.exec(text)
  if (short) {
    const month = Number(short[1])
    const year = Number(short[2]) + (short[2]?.length === 2 ? 2000 : 0)
    if (month >= 1 && month <= 12) {
      return {
        ok: true,
        value: `${year}-${String(month).padStart(2, '0')}` as `${number}-${number}`,
      }
    }
    return { ok: false, error: `Mês inválido: "${text}"` }
  }
  const isoMonth = /^(\d{4})-(\d{2})$/.exec(text)
  if (isoMonth && Number(isoMonth[2]) >= 1 && Number(isoMonth[2]) <= 12) {
    return { ok: true, value: text as `${number}-${number}` }
  }
  const date = parseImportDate(cell)
  if (date.ok && date.value)
    return { ok: true, value: date.value.slice(0, 7) as `${number}-${number}` }
  return { ok: false, error: `Mês inválido: "${text || String(cell)}" (use mm/aaaa)` }
}

const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'marco',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

/** "MARÇO" / "mar" / "Março 2026" → 3; outra coisa → `null`. */
export function monthNumberFromName(value: string): number | null {
  const text = normalizeText(value)
    .replace(/[^a-z ]/g, ' ')
    .trim()
  const word = text.split(' ')[0] ?? ''
  if (word.length < 3) return null
  const index = MONTH_NAMES.findIndex((name) =>
    word.length === 3 ? name.startsWith(word) : name === word,
  )
  return index === -1 ? null : index + 1
}

/** Primeiro dia útil "seguro" para uma data num mês: mantém o dia, limitado ao fim do mês. */
export function sameDayInMonth(month: string, date: IsoDate | null): IsoDate {
  const [year = 0, monthNumber = 1] = month.split('-').map(Number)
  const day = date && isIsoDate(date) ? parseIsoDate(date).day : 1
  return formatIsoDate({
    year,
    month: monthNumber,
    day: Math.min(day, daysInMonth(year, monthNumber)),
  })
}
