import { describe, expect, it } from 'vitest'
import {
  canTransitionFeedback,
  compareFeedbackQueue,
  FEEDBACK_STATUSES,
  feedbackTransitions,
  isOpenFeedback,
  parseAdminUsernames,
} from './index.ts'

describe('relatos: status e fila', () => {
  it('dono aprova/recusa; agente só pega aprovados e entrega para revisão', () => {
    expect(canTransitionFeedback('pending', 'approved', 'owner')).toBe(true)
    expect(canTransitionFeedback('pending', 'rejected', 'owner')).toBe(true)
    expect(canTransitionFeedback('review', 'done', 'owner')).toBe(true)
    expect(canTransitionFeedback('done', 'pending', 'owner')).toBe(true)
    expect(canTransitionFeedback('pending', 'done', 'owner')).toBe(false)

    expect(canTransitionFeedback('approved', 'in_progress', 'agent')).toBe(true)
    expect(canTransitionFeedback('in_progress', 'review', 'agent')).toBe(true)
    expect(canTransitionFeedback('in_progress', 'approved', 'agent')).toBe(true)
    // O freio: agente não pega pendentes, não aprova, não conclui, não recusa.
    expect(canTransitionFeedback('pending', 'in_progress', 'agent')).toBe(false)
    expect(canTransitionFeedback('pending', 'approved', 'agent')).toBe(false)
    expect(canTransitionFeedback('review', 'done', 'agent')).toBe(false)
    expect(canTransitionFeedback('in_progress', 'rejected', 'agent')).toBe(false)
    for (const status of FEEDBACK_STATUSES) {
      expect(feedbackTransitions(status, 'agent')).not.toContain('done')
      expect(feedbackTransitions(status, 'owner')).not.toContain(status)
    }
  })

  it('abertos, admins e ordem da fila', () => {
    expect(FEEDBACK_STATUSES.filter(isOpenFeedback)).toEqual([
      'pending',
      'approved',
      'in_progress',
      'review',
    ])
    expect(parseAdminUsernames(' Calian, demo ,,calian ')).toEqual(['calian', 'demo'])
    expect(parseAdminUsernames(undefined)).toEqual([])

    const items = [
      { id: 'a', priority: null, createdAt: '2026-11-01T10:00:00Z' },
      { id: 'b', priority: 'low', createdAt: '2026-10-01T10:00:00Z' },
      { id: 'c', priority: 'high', createdAt: '2026-11-05T10:00:00Z' },
      { id: 'd', priority: 'medium', createdAt: '2026-11-02T10:00:00Z' },
      { id: 'e', priority: 'high', createdAt: '2026-11-03T10:00:00Z' },
    ] as const
    expect([...items].sort(compareFeedbackQueue).map((item) => item.id)).toEqual([
      'e',
      'c',
      'd',
      'a',
      'b',
    ])
  })
})
