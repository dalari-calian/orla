import {
  currentCompetenceMonth,
  todayIsoDate,
  type CompetenceMonth,
  type IsoDate,
} from '@orla/core'

/** Relógio injetável (os testes fixam a data). "Hoje" e "mês atual" no fuso do app. */
export interface Clock {
  today: () => IsoDate
  currentMonth: () => CompetenceMonth
}

export function createClock(timezone: string, now: () => Date = () => new Date()): Clock {
  return {
    today: () => todayIsoDate(now(), timezone),
    currentMonth: () => currentCompetenceMonth(now(), timezone),
  }
}
