import { CONTRIBUTION_TIMINGS, type ContributionTiming } from '@orla/core'
import {
  updateSettingsRequestSchema,
  type SavingsGoal,
  type SettingsResponse,
} from '@orla/contracts'
import type { PrismaClient } from '@orla/db'
import { Router } from 'express'
import { centsToNumber } from '../lib/db.ts'
import { parse } from '../lib/validate.ts'
import { userIdOf } from '../middleware/auth.ts'

type SettingsRow = Awaited<ReturnType<PrismaClient['userSettings']['upsert']>>

function toSavingsGoal(row: SettingsRow): SavingsGoal {
  if (row.defaultSavingsGoalCents !== null) {
    return { mode: 'fixed', amountCents: centsToNumber(row.defaultSavingsGoalCents) }
  }
  if (row.defaultSavingsGoalPct !== null) {
    return { mode: 'percent', percent: row.defaultSavingsGoalPct.toString() }
  }
  return { mode: 'none' }
}

function toResponse(row: SettingsRow): SettingsResponse {
  return {
    savingsGoal: toSavingsGoal(row),
    cardCompetence: row.cardCompetence === 'closing_month' ? 'closing_month' : 'due_month',
    theme: row.theme === 'light' || row.theme === 'dark' ? row.theme : 'system',
    hideValues: row.hideValues,
    onboardingCompleted: row.onboardingCompletedAt !== null,
    contributionTiming: (CONTRIBUTION_TIMINGS as readonly string[]).includes(row.contributionTiming)
      ? (row.contributionTiming as ContributionTiming)
      : 'end',
    returnContributionSource:
      row.returnContributionSource === 'trades' ? 'trades' : 'contributions',
  }
}

/** /me/settings — preferências do usuário (meta de investimento, tema, onboarding). */
export function settingsRouter(prisma: PrismaClient): Router {
  const router = Router()

  router.get('/me/settings', async (req, res) => {
    const userId = userIdOf(req)
    const row = await prisma.userSettings.upsert({
      where: { userId },
      create: { userId },
      update: {},
    })
    res.json(toResponse(row))
  })

  router.patch('/me/settings', async (req, res) => {
    const userId = userIdOf(req)
    const input = parse(updateSettingsRequestSchema, req.body)

    const data: Parameters<PrismaClient['userSettings']['update']>[0]['data'] = {}
    if (input.savingsGoal) {
      const goal = input.savingsGoal
      data.defaultSavingsGoalCents = goal.mode === 'fixed' ? BigInt(goal.amountCents) : null
      data.defaultSavingsGoalPct = goal.mode === 'percent' ? goal.percent : null
    }
    if (input.cardCompetence) data.cardCompetence = input.cardCompetence
    if (input.theme) data.theme = input.theme
    if (input.hideValues !== undefined) data.hideValues = input.hideValues
    if (input.contributionTiming) data.contributionTiming = input.contributionTiming
    if (input.returnContributionSource) {
      data.returnContributionSource = input.returnContributionSource
    }
    if (input.onboardingCompleted !== undefined) {
      data.onboardingCompletedAt = input.onboardingCompleted ? new Date() : null
    }

    // Garante que a linha existe (usuário antigo sem settings) e aplica a mudança.
    await prisma.userSettings.upsert({ where: { userId }, create: { userId }, update: {} })
    const row = await prisma.userSettings.update({ where: { userId }, data })
    res.json(toResponse(row))
  })

  return router
}
