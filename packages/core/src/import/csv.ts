/**
 * CSV em pt-BR (docs/08): o separador (`;`, `,` ou tab) é detectado na leitura; a exportação
 * usa `;` (RE-01), que o Excel em português abre direto.
 */

export type CsvSeparator = ';' | ',' | '\t'

/** Conta separadores fora de aspas na primeira linha e escolhe o mais frequente (`;` empata). */
export function detectSeparator(text: string): CsvSeparator {
  const counts: Record<CsvSeparator, number> = { ';': 0, ',': 0, '\t': 0 }
  let quoted = false
  for (const char of text) {
    if (char === '"') quoted = !quoted
    else if (!quoted && (char === '\n' || char === '\r')) break
    else if (!quoted && char in counts) counts[char as CsvSeparator] += 1
  }
  if (counts['\t'] > counts[';'] && counts['\t'] > counts[',']) return '\t'
  return counts[','] > counts[';'] ? ',' : ';'
}

/**
 * Lê CSV (RFC 4180): campos entre aspas podem ter separador, aspas dobradas (`""`) e quebras
 * de linha. Remove o BOM e a última linha vazia.
 */
export function parseCsv(
  input: string,
  separator: CsvSeparator = detectSeparator(input),
): string[][] {
  const text = input.startsWith('\uFEFF') ? input.slice(1) : input
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += char
      continue
    }
    if (char === '"' && field === '') quoted = true
    else if (char === separator) {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += char
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((line) => line.some((cell) => cell.trim() !== ''))
}

/**
 * Proteção contra "fórmula injetada" ao abrir no Excel: texto que começa com `=`, `+`, `@`,
 * tab ou CR ganha um apóstrofo. Números negativos (`-10,00`) passam intactos.
 */
function safeText(value: string): string {
  return /^[=+@\t\r]/.test(value) ? `'${value}` : value
}

/** Gera CSV com `;` (padrão pt-BR). Campos com separador, aspas ou quebra vão entre aspas. */
export function toCsv(
  rows: readonly (readonly (string | number | null | undefined)[])[],
  separator: CsvSeparator = ';',
): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell === null || cell === undefined) return ''
          const text = typeof cell === 'number' ? String(cell) : safeText(cell)
          return /[";\n\r,\t]/.test(text) && (text.includes(separator) || /["\n\r]/.test(text))
            ? `"${text.replaceAll('"', '""')}"`
            : text
        })
        .join(separator),
    )
    .join('\r\n')
}
