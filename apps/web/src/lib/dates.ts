const APP_TIMEZONE = 'America/Sao_Paulo'

const monthYear = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
  timeZone: APP_TIMEZONE,
})

/** "novembro de 2026", no fuso de referência do app. */
export function formatMonthYear(date: Date): string {
  return monthYear.format(date)
}
