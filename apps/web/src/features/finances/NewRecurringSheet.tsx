import { lazy, Suspense } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { Skeleton } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useRecurringTemplateMutations } from './api'
import type { RecurringKind } from './RecurringTemplatesPage'

// O formulário mora no chunk da tela de Recorrentes; só carrega quando o sheet abre.
const TemplateForm = lazy(async () => ({
  default: (await import('./RecurringTemplatesPage')).TemplateForm,
}))

const titles: Record<RecurringKind, string> = {
  income: 'Nova entrada fixa',
  fixed: 'Nova conta fixa',
  planned: 'Novo planejamento',
}

/**
 * Atalho para cadastrar um modelo recorrente (salário, aluguel, assinatura) sem passar por
 * Ajustes › Recorrentes. `kind` nulo = fechado.
 */
export function NewRecurringSheet({
  kind,
  onClose,
}: {
  kind: RecurringKind | null
  onClose: () => void
}) {
  const { create } = useRecurringTemplateMutations()
  const toast = useToast()
  const close = () => {
    create.reset()
    onClose()
  }
  return (
    <Sheet open={kind !== null} onClose={close} title={kind ? titles[kind] : 'Novo modelo'}>
      {kind && (
        <Suspense
          fallback={
            <div className="space-y-4" aria-busy>
              <Skeleton className="h-9" />
              <Skeleton className="h-16" />
              <Skeleton className="h-12" />
            </div>
          }
        >
          <TemplateForm
            key={kind}
            initialKind={kind}
            submitting={create.isPending}
            error={create.error}
            onSubmit={async (values) => {
              await create.mutateAsync(values)
              toast({
                message:
                  kind === 'income'
                    ? 'Entrada fixa criada. Ela aparece como prevista todo mês.'
                    : 'Conta fixa criada. Ela aparece como prevista todo mês.',
              })
              close()
            }}
          />
        </Suspense>
      )}
    </Sheet>
  )
}
