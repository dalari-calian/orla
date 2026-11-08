/**
 * Relatos de bug e sugestões de melhoria (docs/15): tipos, status e a fila.
 *
 * Ciclo: o usuário envia (pendente) → o dono aprova ou recusa → um agente pega um item
 * aprovado (em andamento) e entrega numa branch (em revisão) → o dono valida (concluído)
 * ou devolve. Agentes só trabalham em itens **aprovados**: é o freio para não sair
 * fazendo tudo o que for sugerido.
 */

export const FEEDBACK_KINDS = ['bug', 'improvement'] as const
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]

export const FEEDBACK_STATUSES = [
  'pending',
  'approved',
  'in_progress',
  'review',
  'done',
  'rejected',
] as const
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]

export const FEEDBACK_PRIORITIES = ['low', 'medium', 'high'] as const
export type FeedbackPriority = (typeof FEEDBACK_PRIORITIES)[number]

/** Quem muda o status: o dono (na tela) ou um agente (pelo comando `pnpm feedback`). */
export type FeedbackActor = 'owner' | 'agent'

const OWNER_TRANSITIONS: Record<FeedbackStatus, readonly FeedbackStatus[]> = {
  pending: ['approved', 'rejected'],
  approved: ['pending', 'in_progress', 'rejected'],
  in_progress: ['approved', 'review', 'rejected'],
  review: ['done', 'in_progress', 'approved'],
  done: ['pending'],
  rejected: ['pending'],
}

/** Agente: pega um aprovado, entrega para revisão ou devolve. Nunca aprova, conclui ou recusa. */
const AGENT_TRANSITIONS: Record<FeedbackStatus, readonly FeedbackStatus[]> = {
  pending: [],
  approved: ['in_progress'],
  in_progress: ['review', 'approved'],
  review: [],
  done: [],
  rejected: [],
}

/** Próximos status possíveis a partir de `from`. */
export function feedbackTransitions(
  from: FeedbackStatus,
  actor: FeedbackActor,
): readonly FeedbackStatus[] {
  return (actor === 'owner' ? OWNER_TRANSITIONS : AGENT_TRANSITIONS)[from]
}

export function canTransitionFeedback(
  from: FeedbackStatus,
  to: FeedbackStatus,
  actor: FeedbackActor,
): boolean {
  return feedbackTransitions(from, actor).includes(to)
}

/** Status em que o item ainda está "aberto" (conta na fila). */
export function isOpenFeedback(status: FeedbackStatus): boolean {
  return status !== 'done' && status !== 'rejected'
}

/** `ADMIN_USERNAMES="calian, Outro"` → `['calian', 'outro']` (usuários são minúsculos). */
export function parseAdminUsernames(value: string | undefined): string[] {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
}

/** Ordem da fila: prioridade alta primeiro, depois o mais antigo. */
export function compareFeedbackQueue(
  a: { priority: FeedbackPriority | null; createdAt: string },
  b: { priority: FeedbackPriority | null; createdAt: string },
): number {
  const rank = (priority: FeedbackPriority | null) =>
    priority === 'high' ? 0 : priority === 'medium' ? 1 : priority === 'low' ? 2 : 1.5
  return rank(a.priority) - rank(b.priority) || a.createdAt.localeCompare(b.createdAt)
}
