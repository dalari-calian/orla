import type { FeedbackKindValue, FeedbackPriorityValue, FeedbackStatusValue } from '@orla/contracts'

export const feedbackKindLabels: Record<FeedbackKindValue, string> = {
  bug: 'Bug',
  improvement: 'Melhoria',
}

export const feedbackStatusLabels: Record<FeedbackStatusValue, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  in_progress: 'Em andamento',
  review: 'Em revisão',
  done: 'Concluído',
  rejected: 'Recusado',
}

/** O que cada status quer dizer, para quem enviou. */
export const feedbackStatusHints: Record<FeedbackStatusValue, string> = {
  pending: 'Recebido, aguardando análise.',
  approved: 'Aprovado para ser feito.',
  in_progress: 'Sendo feito agora.',
  review: 'Pronto, em revisão antes de entrar no app.',
  done: 'Já está no app.',
  rejected: 'Não vai ser feito.',
}

/** Cor do selo de status (tokens do design system). */
export const feedbackStatusColors: Record<FeedbackStatusValue, string> = {
  pending: 'var(--text-2)',
  approved: 'var(--accent)',
  in_progress: 'var(--warning)',
  review: 'var(--chart-4)',
  done: 'var(--positive)',
  rejected: 'var(--negative)',
}

export const feedbackPriorityLabels: Record<FeedbackPriorityValue, string> = {
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
}
