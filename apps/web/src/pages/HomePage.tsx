import { formatBRLParts } from '@orla/core/money'
import { CircleCheck } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { SystemStatus } from '@/components/SystemStatus'
import { Card } from '@/components/ui/Card'
import { GroupedList, ListRow } from '@/components/ui/GroupedList'
import { useMe } from '@/features/auth/api'
import { formatMonthYear } from '@/lib/dates'

const roadmap = [
  { phase: 0, title: 'Fundação', detail: 'Monorepo, banco, API, casca do app' },
  { phase: 1, title: 'Login e cadastros', detail: 'Contas, cartões, categorias' },
  { phase: 2, title: 'Finanças', detail: 'Lançamentos, parcelas, fatura, metas' },
  { phase: 3, title: 'Dashboard e projeção', detail: 'Gráficos e próximos 12 meses' },
  { phase: 4, title: 'Importação', detail: 'Trazer as planilhas para o app' },
  { phase: 5, title: 'Carteira', detail: 'Ativos, operações, proventos, cotações' },
  { phase: 6, title: 'Aporte', detail: 'Simulador e rebalanceamento' },
  { phase: 7, title: 'Balanço', detail: 'Rentabilidade real mês a mês' },
  { phase: 8, title: 'Notícias e polimento', detail: 'Notícias, ocultar valores, E2E' },
]

const CURRENT_PHASE = 1

function HeroAmount({ cents }: { cents: number }) {
  const parts = formatBRLParts(cents)
  return (
    <p className="text-[44px] leading-none font-semibold tracking-tight tabular lg:text-5xl">
      {parts.sign}
      <span className="mr-1 text-title-2 font-medium text-text-2">{parts.symbol}</span>
      {parts.integer}
      <span className="text-title-2 text-text-2">,{parts.fraction}</span>
    </p>
  )
}

export function HomePage() {
  const me = useMe()
  const firstName = (me.data?.displayName || me.data?.username || '').split(' ')[0]
  return (
    <>
      <PageHeader
        title="Início"
        subtitle={`Olá, ${firstName}! Este é o seu mês de ${formatMonthYear(new Date())}.`}
      />

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Card className="md:col-span-2 xl:col-span-2">
          <p className="text-subhead text-text-2">Sobra prevista do mês</p>
          <div className="mt-2">
            <HeroAmount cents={0} />
          </div>
          <p className="mt-3 text-footnote text-text-2">
            Os valores aparecem aqui quando os lançamentos chegarem (Fase 2).
          </p>
        </Card>

        <SystemStatus />

        <GroupedList title="Roteiro do Orla" className="md:col-span-2 xl:col-span-3">
          {roadmap.map((step) => (
            <ListRow
              key={step.phase}
              icon={step.phase <= CURRENT_PHASE ? CircleCheck : undefined}
              iconColor="var(--positive)"
              title={`Fase ${step.phase} — ${step.title}`}
              subtitle={step.detail}
              value={
                step.phase === CURRENT_PHASE ? 'Agora' : step.phase < CURRENT_PHASE ? 'Feito' : ''
              }
            />
          ))}
        </GroupedList>
      </div>
    </>
  )
}
