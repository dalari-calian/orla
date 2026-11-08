/**
 * Fase 4 — importação (RI-02/03/04), exportação (RE-01) e backup/restauração (RE-02),
 * contra o Postgres real. Relógio fixo em 20/11/2026.
 */
import {
  backupSchema,
  exportTableSchema,
  importJobSchema,
  importRowsResponseSchema,
  type ImportRowsRequest,
} from '@orla/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeApp, resetDatabase, signUp } from './support/app.ts'

const app = makeApp({ now: () => new Date('2026-11-20T15:00:00Z') })
type Agent = Awaited<ReturnType<typeof signUp>>['agent']
let agent: Agent

beforeEach(async () => {
  await resetDatabase()
  agent = (await signUp(app, 'dono')).agent
  const accountId = (
    await agent
      .post('/api/v1/accounts')
      .send({ name: 'Nubank', kind: 'checking', color: '#AF52DE' })
  ).body.id
  await agent
    .post('/api/v1/credit-cards')
    .send({ accountId, name: 'Nubank Roxinho', closingDay: 25, dueDay: 2 })
})

const base = {
  kind: 'transaction' as const,
  status: 'settled' as const,
  competenceMonth: null,
  paymentMethod: null,
  categoryName: null,
  accountName: null,
  cardName: null,
  payeeName: null,
  notes: null,
}

type Rows = ImportRowsRequest['rows']

async function startJob(rows: Rows, kind = 'transactions') {
  const job = await agent
    .post('/api/v1/imports')
    .send({ kind, fileName: 'planilha.xlsx', mapping: { data: 0 } })
  expect(job.status).toBe(201)
  const checked = await agent.post(`/api/v1/imports/${job.body.id}/rows`).send({ rows })
  expect(checked.status).toBe(200)
  return { id: job.body.id as string, checks: importRowsResponseSchema.parse(checked.body).rows }
}

async function month(value: string) {
  return (await agent.get(`/api/v1/months/${value}`)).body
}

describe('importação', () => {
  const rows: Rows = [
    {
      rowNumber: 2,
      draft: {
        ...base,
        type: 'income',
        nature: 'fixed',
        description: 'SALÁRIO',
        amountCents: 4379_00,
        date: '2026-01-01',
        competenceMonth: '2026-01',
      },
    },
    {
      rowNumber: 3,
      draft: {
        ...base,
        type: 'expense',
        nature: 'variable',
        description: 'Presente natal',
        amountCents: 299_90,
        date: '2025-12-20',
        competenceMonth: '2026-01',
        paymentMethod: 'credit',
        cardName: 'NUBANK',
        categoryName: 'Presentes extras',
        payeeName: 'Loja X',
      },
    },
    {
      rowNumber: 4,
      draft: {
        ...base,
        type: 'expense',
        nature: 'variable',
        description: 'Cinema',
        amountCents: 40_00,
        date: '2026-01-10',
        paymentMethod: 'credit',
        cardName: 'Itaú',
      },
    },
    {
      rowNumber: 5,
      draft: {
        ...base,
        type: 'expense',
        nature: 'fixed',
        description: 'Cotas banco',
        amountCents: 30_00,
        date: '2026-01-05',
        accountName: 'Ailos',
      },
    },
    {
      rowNumber: 6,
      sourceRows: [6, 20],
      draft: {
        kind: 'installmentPlan',
        description: 'Notebook',
        purchaseDate: '2025-07-10',
        installmentsCount: 10,
        totalCents: 530_00,
        firstCompetenceMonth: '2025-07',
        currentInstallment: null,
        settledCount: 7,
        payoffMonth: null,
        paymentMethod: 'credit',
        categoryName: null,
        accountName: null,
        cardName: 'Nubank',
        payeeName: null,
        notes: null,
      },
    },
    {
      rowNumber: 7,
      draft: {
        kind: 'installmentPlan',
        description: 'Corrente',
        purchaseDate: '2025-06-01',
        installmentsCount: 12,
        totalCents: 2040_00,
        firstCompetenceMonth: '2025-06',
        currentInstallment: null,
        settledCount: 8,
        payoffMonth: '2026-01',
        paymentMethod: 'boleto',
        categoryName: null,
        accountName: null,
        cardName: null,
        payeeName: 'Pai',
        notes: null,
      },
    },
    {
      rowNumber: 8,
      draft: { kind: 'monthGoal', month: '2026-01', goalCents: 1254_25, investedCents: 1254_25 },
    },
  ]

  it('confere, grava tudo de uma vez e desfaz (RI-02/03/04)', async () => {
    const { id, checks } = await startJob(rows)
    const byRow = new Map(checks.map((check) => [check.rowNumber, check]))
    expect(byRow.get(2)?.status).toBe('ok')
    expect(byRow.get(3)).toMatchObject({
      status: 'ok',
      creates: ['Categoria: Presentes extras', 'Estabelecimento: Loja X'],
    })
    expect(byRow.get(4)).toMatchObject({ status: 'error' })
    expect(byRow.get(4)?.messages[0]).toMatch(/Cartão "Itaú" não cadastrado/)
    expect(byRow.get(5)?.creates).toEqual(['Conta: Ailos'])

    const committed = await agent.post(`/api/v1/imports/${id}/commit`).send({})
    expect(committed.status).toBe(200)
    const job = importJobSchema.parse(committed.body)
    expect(job.status).toBe('committed')
    expect(job.stats).toMatchObject({
      transactions: 3,
      installmentPlans: 2,
      monthGoals: 1,
      skipped: 1,
    })
    expect(job.stats.created).toEqual(
      expect.arrayContaining([
        'Categoria: Presentes extras',
        'Estabelecimento: Loja X',
        'Conta: Ailos',
        'Estabelecimento: Pai',
      ]),
    )

    const jan = await month('2026-01')
    const descriptions = jan.transactions.map((item: { description: string }) => item.description)
    expect(descriptions).toEqual(
      expect.arrayContaining([
        'SALÁRIO',
        'Presente natal',
        'Cotas banco',
        'Notebook',
        'Quitação: Corrente',
      ]),
    )
    expect(jan.settings.goalInvestedCents).toBe(1254_25)
    const gift = jan.transactions.find(
      (item: { description: string }) => item.description === 'Presente natal',
    )
    expect(gift).toMatchObject({ status: 'settled', paymentMethod: 'credit', date: '2025-12-20' })

    const plans = (await agent.get('/api/v1/installment-plans?status=all')).body.data
    const notebook = plans.find((plan: { description: string }) => plan.description === 'Notebook')
    expect(notebook.indicators).toMatchObject({ paidCents: 371_00, remainingCount: 3 })
    const chain = plans.find((plan: { description: string }) => plan.description === 'Corrente')
    expect(chain.status).toBe('paid_off')
    expect(chain.indicators.remainingCents).toBe(0)

    // Reimportar o mesmo arquivo: tudo vira "provável duplicado" (RI-02).
    const again = await startJob(rows.filter((row) => row.rowNumber !== 4))
    expect(
      again.checks.filter((check) => check.status === 'duplicate').map((check) => check.rowNumber),
    ).toEqual([2, 3, 5, 6, 7])
    expect(again.checks.find((check) => check.rowNumber === 8)?.status).toBe('warning')

    const history = (await agent.get('/api/v1/imports')).body.data
    expect(history).toHaveLength(1)
    expect((await agent.get('/api/v1/imports/mappings')).body).toEqual({
      transactions: { data: 0 },
    })

    const undone = await agent.post(`/api/v1/imports/${id}/undo`)
    expect(undone.status).toBe(200)
    expect(undone.body.status).toBe('undone')
    const after = await month('2026-01')
    expect(after.transactions).toHaveLength(0)
    expect(after.settings.goalInvestedCents).toBeNull()
    const accounts = (await agent.get('/api/v1/accounts')).body.data.map(
      (item: { name: string }) => item.name,
    )
    expect(accounts).toEqual(['Nubank'])
    expect((await agent.post(`/api/v1/imports/${id}/undo`)).status).toBe(409)
  })

  it('linhas desmarcadas não entram; sem criar cadastros, as referências ficam vazias', async () => {
    const { id } = await startJob(rows.slice(0, 4))
    const committed = await agent
      .post(`/api/v1/imports/${id}/commit`)
      .send({ skipRows: [2], createMissing: false })
    expect(committed.body.stats).toMatchObject({ transactions: 2, skipped: 2, created: [] })
    const jan = await month('2026-01')
    expect(
      jan.transactions.map((item: { description: string }) => item.description).sort(),
    ).toEqual(['Cotas banco', 'Presente natal'])
    expect(
      jan.transactions.every((item: { categoryId: string | null }) => item.categoryId === null),
    ).toBe(true)
    expect((await agent.post(`/api/v1/imports/${id}/commit`).send({})).status).toBe(409)
  })

  it('o lançamento importado ocupa o mês do modelo recorrente (sem salário em dobro)', async () => {
    await agent.post('/api/v1/recurring-templates').send({
      type: 'income',
      description: 'Salário',
      amountCents: 6000_00,
      dayOfMonth: 5,
      startMonth: '2026-01',
    })
    const { id } = await startJob([rows[0] as Rows[number]])
    await agent.post(`/api/v1/imports/${id}/commit`).send({})
    const jan = await month('2026-01')
    expect(jan.transactions).toHaveLength(1)
    expect(jan.transactions[0]).toMatchObject({ description: 'SALÁRIO', amountCents: 4379_00 })
  })

  it('validação, limites e isolamento', async () => {
    const job = await agent
      .post('/api/v1/imports')
      .send({ kind: 'transactions', fileName: 'a.csv' })
    const tooMany = Array.from({ length: 501 }, (_, i) => ({ ...rows[0], rowNumber: i + 1 }))
    expect(
      (await agent.post(`/api/v1/imports/${job.body.id}/rows`).send({ rows: tooMany })).status,
    ).toBe(400)
    const bad = await agent.post(`/api/v1/imports/${job.body.id}/rows`).send({
      rows: [
        {
          rowNumber: 1,
          draft: {
            ...base,
            type: 'expense',
            nature: 'variable',
            description: '',
            amountCents: -1,
            date: 'x',
          },
        },
      ],
    })
    expect(bad.status).toBe(400)
    const other = (await signUp(app, 'outra')).agent
    expect((await other.post(`/api/v1/imports/${job.body.id}/commit`).send({})).status).toBe(404)
    expect((await other.get('/api/v1/imports')).body.data).toEqual([])
  })
})

describe('exportação e backup', () => {
  beforeEach(async () => {
    await agent.post('/api/v1/transactions').send({
      type: 'expense',
      nature: 'variable',
      description: 'Feira; sábado',
      amountCents: 1234_56,
      date: '2026-11-05',
      paymentMethod: 'pix',
    })
    await agent.post('/api/v1/transactions').send({
      type: 'income',
      nature: 'extra',
      description: 'Presente',
      amountCents: 300_00,
      date: '2026-10-05',
    })
  })

  it('CSV pt-BR com ; e filtro de período (RE-01)', async () => {
    const csv = await agent.get('/api/v1/exports/transactions?format=csv&from=2026-11&to=2026-11')
    expect(csv.status).toBe(200)
    expect(csv.headers['content-type']).toMatch(/text\/csv/)
    expect(csv.text.charCodeAt(0)).toBe(0xfeff)
    const lines = csv.text.slice(1).split('\r\n')
    expect(lines[0]).toBe(
      'data;competencia;tipo;natureza;descricao;valor;categoria;forma_pagamento;conta;cartao;estabelecimento;status;observacao',
    )
    expect(lines[1]).toBe(
      '05/11/2026;11/2026;despesa;variavel;"Feira; sábado";1234,56;;pix;;;;pago;',
    )
    expect(lines).toHaveLength(2)

    const json = exportTableSchema.parse(
      (await agent.get('/api/v1/exports/transactions?format=json')).body,
    )
    expect(json.rows).toHaveLength(2)
    expect((await agent.get('/api/v1/exports/installment-plans?format=json')).status).toBe(200)
    expect((await agent.get('/api/v1/exports/nada')).status).toBe(404)
  })

  it('backup completo e restauração (RE-02)', async () => {
    const backup = backupSchema.parse((await agent.get('/api/v1/backup')).body)
    expect(backup.data.transactions).toHaveLength(2)
    expect(backup.data.creditCards).toHaveLength(1)
    expect(backup.data.transactions[0]).not.toHaveProperty('userId')

    // Restaurar na mesma conta, mesclando: nada muda.
    const merged = await agent.post('/api/v1/restore').send({ mode: 'merge', backup })
    expect(merged.body).toEqual({ created: 0, updated: 0, removed: 0 })

    // Novo lançamento depois do backup; substituir volta ao estado do backup.
    await agent.post('/api/v1/transactions').send({
      type: 'expense',
      nature: 'variable',
      description: 'Depois',
      amountCents: 1_00,
      date: '2026-11-06',
    })
    const replaced = await agent.post('/api/v1/restore').send({ mode: 'replace', backup })
    expect(replaced.status).toBe(200)
    expect(replaced.body.removed).toBe(1)
    const nov = await month('2026-11')
    expect(nov.transactions.map((item: { description: string }) => item.description)).toEqual([
      'Feira; sábado',
    ])

    // Em outra conta: cria tudo de novo, mas nunca mexe nos dados (IDs) da conta original.
    const other = (await signUp(app, 'outra')).agent
    const restored = await other.post('/api/v1/restore').send({ mode: 'merge', backup })
    expect(restored.status).toBe(200)
    expect(restored.body.created).toBe(0)
    expect((await agent.get('/api/v1/months/2026-11')).body.transactions).toHaveLength(1)

    const invalid = await agent
      .post('/api/v1/restore')
      .send({ mode: 'merge', backup: { app: 'outro' } })
    expect(invalid.status).toBe(400)
  })
})
