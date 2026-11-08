/**
 * Quando uma cotação em cache ainda serve (RC-31/32) — o centro da economia de chamadas ao
 * provedor (pago/limitado):
 * - durante o pregão (dias úteis, 10h–18h30 em São Paulo): vale por `ttlMinutes` (30);
 * - fora do pregão: vale se foi buscada depois do último fechamento — à noite, no fim de
 *   semana e de manhã cedo não há por que buscar de novo;
 * - falhou há pouco: espera `retryMinutes` antes de tentar de novo.
 * Feriados não são tratados (no pior caso, algumas chamadas a mais no dia).
 */

const SAO_PAULO_OFFSET_HOURS = -3
const OPEN_MINUTES = 10 * 60
const CLOSE_MINUTES = 18 * 60 + 30
const MINUTE_MS = 60_000
const DAY_MS = 86_400_000

/** "Horário de São Paulo" como um Date deslocado (só para ler dia da semana e minutos). */
function local(date: Date): Date {
  return new Date(date.getTime() + SAO_PAULO_OFFSET_HOURS * 3_600_000)
}

function isWeekday(localDate: Date): boolean {
  const day = localDate.getUTCDay()
  return day >= 1 && day <= 5
}

function minutesOfDay(localDate: Date): number {
  return localDate.getUTCHours() * 60 + localDate.getUTCMinutes()
}

/** O pregão está aberto neste instante? */
export function isMarketOpen(now: Date): boolean {
  const at = local(now)
  const minutes = minutesOfDay(at)
  return isWeekday(at) && minutes >= OPEN_MINUTES && minutes < CLOSE_MINUTES
}

/** Instante (UTC) do último fechamento de pregão até `now`. */
export function lastMarketClose(now: Date): Date {
  const at = local(now)
  let day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))
  // Hoje já fechou? Senão, volta para o dia útil anterior.
  if (!(isWeekday(at) && minutesOfDay(at) >= CLOSE_MINUTES)) day = new Date(day.getTime() - DAY_MS)
  while (!isWeekday(day)) day = new Date(day.getTime() - DAY_MS)
  return new Date(day.getTime() + CLOSE_MINUTES * MINUTE_MS - SAO_PAULO_OFFSET_HOURS * 3_600_000)
}

export interface CachedQuoteState {
  fetchedAt: Date | null
  errorAt?: Date | null
}

export interface FreshnessOptions {
  ttlMinutes?: number
  retryMinutes?: number
}

/** `true` = usar o cache, sem chamar o provedor. */
export function quoteIsFresh(
  state: CachedQuoteState,
  now: Date,
  { ttlMinutes = 30, retryMinutes = 360 }: FreshnessOptions = {},
): boolean {
  if (state.errorAt && now.getTime() - state.errorAt.getTime() < retryMinutes * MINUTE_MS)
    return true
  if (!state.fetchedAt) return false
  if (now.getTime() - state.fetchedAt.getTime() < ttlMinutes * MINUTE_MS) return true
  if (isMarketOpen(now)) return false
  return state.fetchedAt.getTime() >= lastMarketClose(now).getTime()
}

/** Mês (`AAAA-MM`, horário de São Paulo) para o contador de chamadas. */
export function usageMonth(now: Date): string {
  return local(now).toISOString().slice(0, 7)
}
