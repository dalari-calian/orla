import { type Cell, IMPORT_EXAMPLES, parseCsv } from '@orla/core/import'
import type { ImportKind } from '@orla/contracts'

/** Uma aba (ou o CSV inteiro) como grade de células. */
export interface SheetGrid {
  name: string
  rows: Cell[][]
}

export interface LoadedFile {
  fileName: string
  sheets: SheetGrid[]
}

export const ACCEPTED_FILES = '.xlsx,.xls,.csv,text/csv'
const MAX_FILE_BYTES = 15 * 1024 * 1024

// SheetJS só é baixado nas telas de importar/exportar (fica fora do bundle inicial).
const loadXlsx = () => import('xlsx')

/** CSV em UTF-8 ou Latin-1 (docs/08): tenta UTF-8 estrito e cai para Windows-1252. */
function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

/** Lê .xlsx/.xls (todas as abas) ou .csv no navegador — só o resultado vai para a API. */
export async function readSpreadsheet(file: File): Promise<LoadedFile> {
  if (file.size > MAX_FILE_BYTES) throw new Error('Arquivo grande demais (máximo 15 MB)')
  const buffer = await file.arrayBuffer()
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
    return { fileName: file.name, sheets: [{ name: 'CSV', rows: parseCsv(decodeText(buffer)) }] }
  }
  const XLSX = await loadXlsx()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, cellFormula: false })
  return {
    fileName: file.name,
    sheets: workbook.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils.sheet_to_json<Cell[]>(workbook.Sheets[name] as never, {
        header: 1,
        raw: true,
        defval: null,
        blankrows: true,
      }),
    })),
  }
}

/** Gera e baixa um .xlsx com uma ou mais abas. */
export async function downloadXlsx(
  fileName: string,
  sheets: { name: string; rows: unknown[][] }[],
) {
  const XLSX = await loadXlsx()
  const workbook = XLSX.utils.book_new()
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(sheet.rows),
      sheet.name.slice(0, 31),
    )
  }
  XLSX.writeFile(workbook, fileName, { compression: true })
}

/** Baixa um conteúdo qualquer como arquivo. */
export function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Planilha de exemplo de cada tipo (docs/08 › Templates oficiais): exemplo + instruções. */
export async function downloadExample(kind: ImportKind) {
  const example = IMPORT_EXAMPLES[kind]
  const XLSX = await loadXlsx()
  const workbook = XLSX.utils.book_new()
  for (const sheet of example.sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows)
    if (sheet.widths) worksheet['!cols'] = sheet.widths.map((wch) => ({ wch }))
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31))
  }
  XLSX.writeFile(workbook, example.fileName, { compression: true })
}
