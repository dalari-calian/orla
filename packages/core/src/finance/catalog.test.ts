import { describe, expect, it } from 'vitest'
import { CATEGORY_ICONS, DEFAULT_CATEGORIES, PALETTE, isHexColor } from './catalog.ts'

describe('DEFAULT_CATEGORIES (RF-60)', () => {
  it('tem as 13 despesas e 5 receitas do doc', () => {
    const names = (kind: 'income' | 'expense') =>
      DEFAULT_CATEGORIES.filter((category) => category.kind === kind).map(
        (category) => category.name,
      )

    expect(names('expense')).toEqual([
      'Moradia',
      'Mercado',
      'Alimentação fora',
      'Transporte',
      'Saúde',
      'Educação',
      'Lazer',
      'Assinaturas',
      'Compras',
      'Presentes',
      'Pets',
      'Viagem',
      'Outros',
    ])
    expect(names('income')).toEqual(['Salário', 'Extra', 'Presente', 'Reembolso', 'Outros'])
  })

  it('não repete nome dentro do mesmo tipo', () => {
    const keys = DEFAULT_CATEGORIES.map(
      (category) => `${category.kind}:${category.name.toLowerCase()}`,
    )
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('usa só ícones e cores do catálogo', () => {
    for (const category of DEFAULT_CATEGORIES) {
      expect(CATEGORY_ICONS).toContain(category.icon)
      expect(PALETTE).toContain(category.color)
    }
  })
})

describe('catálogos', () => {
  it('ícones e cores sem repetição', () => {
    expect(new Set(CATEGORY_ICONS).size).toBe(CATEGORY_ICONS.length)
    expect(new Set(PALETTE).size).toBe(PALETTE.length)
  })

  it('isHexColor', () => {
    expect(isHexColor('#007AFF')).toBe(true)
    expect(isHexColor('#007aff')).toBe(true)
    expect(isHexColor('007AFF')).toBe(false)
    expect(isHexColor('#07F')).toBe(false)
    expect(isHexColor('#GGGGGG')).toBe(false)
  })
})
