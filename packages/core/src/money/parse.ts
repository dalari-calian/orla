import { MoneyError, reaisToCents, type Cents } from './cents.ts'

export class MoneyParseError extends MoneyError {
  override name = 'MoneyParseError'
}

const THOUSANDS_GROUPED = /^\d{1,3}(\.\d{3})+$/
const DIGITS = /^\d+$/
/** Sinal de menos tipográfico (U+2212), comum ao colar de planilhas. */
const MINUS_SIGN = String.fromCharCode(0x2212)

/**
 * Converte texto digitado/colado em pt-BR para centavos.
 *
 * Aceita: "1.234,56", "R$ 1.234,56", "1234,56", "1234", ",50", "-10,00", "(10,00)",
 * "+10", "10,5" (= R$ 10,50) e "10," (enquanto digita = R$ 10,00).
 *
 * Sem vírgula, o ponto é ambíguo. Decisão (docs/03 › Decisões em aberto):
 *  - "1.500" / "1.234.567" (grupos de 3) → separador de milhar (R$ 1.500,00);
 *  - "10.5" / "10.50" (1–2 casas) → separador decimal (R$ 10,50), comum ao colar de outros apps.
 *
 * Rejeita mais de 2 casas decimais ("12,345") em vez de arredondar silenciosamente.
 */
export function parseBRL(input: string): Cents {
  // `\s` já cobre os espaços não separáveis (U+00A0 e U+202F) que o Intl usa.
  let text = input.replace(/\s/g, '').replace(/^R\$/i, '').replaceAll(MINUS_SIGN, '-')

  let negative = false
  if (text.startsWith('(') && text.endsWith(')')) {
    negative = true
    text = text.slice(1, -1)
  }
  text = text.replace(/^R\$/i, '')
  if (text.startsWith('-')) {
    negative = !negative
    text = text.slice(1)
  } else if (text.endsWith('-')) {
    negative = !negative
    text = text.slice(0, -1)
  } else if (text.startsWith('+')) {
    text = text.slice(1)
  }
  text = text.replace(/^R\$/i, '')

  if (!/\d/.test(text) || !/^[\d.,]+$/.test(text)) {
    throw new MoneyParseError(`Valor inválido: "${input}"`)
  }

  let integerPart: string
  let fractionPart: string

  if (text.includes(',')) {
    const pieces = text.split(',')
    if (pieces.length !== 2) throw new MoneyParseError(`Mais de uma vírgula em "${input}"`)
    const [rawInteger = '', rawFraction = ''] = pieces
    if (rawFraction.length > 2 || (rawFraction !== '' && !DIGITS.test(rawFraction))) {
      throw new MoneyParseError(`Use no máximo 2 casas decimais: "${input}"`)
    }
    if (rawInteger !== '' && !DIGITS.test(rawInteger) && !THOUSANDS_GROUPED.test(rawInteger)) {
      throw new MoneyParseError(`Separador de milhar inválido em "${input}"`)
    }
    integerPart = rawInteger.replace(/\./g, '')
    fractionPart = rawFraction
  } else if (DIGITS.test(text)) {
    integerPart = text
    fractionPart = ''
  } else if (THOUSANDS_GROUPED.test(text)) {
    integerPart = text.replace(/\./g, '')
    fractionPart = ''
  } else if (/^\d*\.\d{1,2}$/.test(text)) {
    const [rawInteger = '', rawFraction = ''] = text.split('.')
    integerPart = rawInteger
    fractionPart = rawFraction
  } else {
    throw new MoneyParseError(`Valor inválido: "${input}"`)
  }

  const cents = reaisToCents(`${integerPart || '0'}.${fractionPart || '0'}`)
  return negative ? -cents + 0 : cents
}

/** Igual a parseBRL, mas devolve null em vez de lançar erro (útil em inputs). */
export function tryParseBRL(input: string): Cents | null {
  try {
    return parseBRL(input)
  } catch (error) {
    if (error instanceof MoneyError) return null
    throw error
  }
}
