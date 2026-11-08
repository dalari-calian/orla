import { describe, expect, it } from 'vitest'
import {
  isAffectedByTemplateChange,
  isRemovedWithTemplate,
  templateDateIn,
  templateOccursIn,
  templatesToMaterialize,
  type RecurrenceRule,
} from './recurrence.ts'

const salary: RecurrenceRule & { id: string } = {
  id: 'salario',
  frequency: 'monthly',
  monthOfYear: null,
  dayOfMonth: 5,
  startMonth: '2026-01',
  endMonth: null,
  isActive: true,
}
const birthday: RecurrenceRule & { id: string } = {
  id: 'aniversario',
  frequency: 'yearly',
  monthOfYear: 10,
  dayOfMonth: 15,
  startMonth: '2026-01',
  endMonth: null,
  isActive: true,
}

describe('RF-11/23 — em quais meses o modelo gera lançamento', () => {
  it('mensal: a partir do início, sem fim', () => {
    expect(templateOccursIn(salary, '2025-12')).toBe(false)
    expect(templateOccursIn(salary, '2026-01')).toBe(true)
    expect(templateOccursIn(salary, '2030-07')).toBe(true)
  })

  it('respeita o mês final e o modelo inativo', () => {
    const ended = { ...salary, endMonth: '2026-06' }
    expect(templateOccursIn(ended, '2026-06')).toBe(true)
    expect(templateOccursIn(ended, '2026-07')).toBe(false)
    expect(templateOccursIn({ ...salary, isActive: false }, '2026-03')).toBe(false)
  })

  it('anual: só no mês do ano escolhido', () => {
    expect(templateOccursIn(birthday, '2026-10')).toBe(true)
    expect(templateOccursIn(birthday, '2026-11')).toBe(false)
    expect(templateOccursIn(birthday, '2027-10')).toBe(true)
  })

  it('data prevista com dia 31 em mês curto', () => {
    expect(templateDateIn({ dayOfMonth: 31 }, '2026-02')).toBe('2026-02-28')
    expect(templateDateIn(salary, '2026-11')).toBe('2026-11-05')
  })

  it('materializa só o que falta (idempotente)', () => {
    expect(templatesToMaterialize([salary, birthday], '2026-10', new Set())).toEqual([
      salary,
      birthday,
    ])
    expect(templatesToMaterialize([salary, birthday], '2026-10', new Set(['salario']))).toEqual([
      birthday,
    ])
    expect(templatesToMaterialize([salary, birthday], '2026-11', new Set(['salario']))).toEqual([])
  })
})

describe('RF-13/14 — editar e excluir o modelo', () => {
  const generated = (
    competenceMonth: string,
    isOverride = false,
    status: 'forecast' | 'settled' = 'forecast',
  ) => ({
    competenceMonth,
    isOverride,
    status,
  })

  it('template editado a partir de Mar não altera Jan/Fev nem overrides', () => {
    expect(isAffectedByTemplateChange(generated('2026-01'), '2026-03')).toBe(false)
    expect(isAffectedByTemplateChange(generated('2026-02'), '2026-03')).toBe(false)
    expect(isAffectedByTemplateChange(generated('2026-03'), '2026-03')).toBe(true)
    expect(isAffectedByTemplateChange(generated('2026-04'), '2026-03')).toBe(true)
    expect(isAffectedByTemplateChange(generated('2026-04', true), '2026-03')).toBe(false)
    expect(isAffectedByTemplateChange(generated('2026-04', false, 'settled'), '2026-03')).toBe(
      false,
    )
  })

  it('excluir remove só os previstos a partir do mês escolhido', () => {
    expect(isRemovedWithTemplate(generated('2026-10'), '2026-11')).toBe(false)
    expect(isRemovedWithTemplate(generated('2026-11'), '2026-11')).toBe(true)
    expect(isRemovedWithTemplate(generated('2026-12', true), '2026-11')).toBe(true)
    expect(isRemovedWithTemplate(generated('2026-12', false, 'settled'), '2026-11')).toBe(false)
  })
})
