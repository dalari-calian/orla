import type { Quote } from '@orla/contracts'
import { Card, CardHeader } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/States'
import { shortDate } from '@/features/finances/labels'
import { formatPercent, formatPrice, relativeTime } from '@/features/portfolio/labels'
import { cn } from '@/lib/cn'
import { useObservedPrices } from './api'

/** Aba "Preços" do ativo: máxima, mínima, DY e P/VP vistos nos balanços (RB-30). */
export function ObservedPricesCard({ assetId, quote }: { assetId: string; quote: Quote | null }) {
  const query = useObservedPrices()
  const item = query.data?.data.find((entry) => entry.assetId === assetId)
  const lastQuote = quote?.price
    ? `Última cotação ${formatPrice(quote.price)} (${relativeTime(quote.quotedAt ?? quote.fetchedAt)}).`
    : null
  if (query.isPending) return <Skeleton className="h-48 rounded-card" />
  if (!item) {
    return (
      <Card className="space-y-2">
        <CardHeader title="Preços observados" />
        <p className="text-subhead text-text-2">
          Os preços anotados nos balanços viram o histórico de máxima, mínima, DY e P/VP deste
          ativo. {lastQuote}
        </p>
      </Card>
    )
  }
  return (
    <Card className="space-y-4">
      <CardHeader title="Preços observados" />
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Mínimo visto', formatPrice(item.min.price), shortDate(item.min.date)],
          ['Máximo visto', formatPrice(item.max.price), shortDate(item.max.date)],
          ['Último DY', item.lastDy ? `${item.lastDy.replace('.', ',')}%` : '—', ''],
          ['Último P/VP', item.lastPvp ? item.lastPvp.replace('.', ',') : '—', ''],
        ].map(([label, value, note]) => (
          <div key={label} className="min-w-0 rounded-field bg-surface-2 p-3">
            <dt className="text-footnote text-text-2">{label}</dt>
            <dd className="truncate text-headline font-semibold tabular">{value}</dd>
            {note && <dd className="text-caption text-text-2">{note}</dd>}
          </div>
        ))}
      </dl>
      <p className="text-subhead text-text-2">
        Hoje {formatPrice(item.currentPrice)}:{' '}
        <span
          className={cn(
            item.aboveMin !== null && item.aboveMin <= 0.03 && 'font-semibold text-positive',
          )}
        >
          {formatPercent(item.aboveMin, true)} da mínima
        </span>{' '}
        e {formatPercent(item.belowMax, true)} da máxima. PM {formatPrice(item.avgPrice)}.
      </p>
      <ul className="divide-y divide-separator text-subhead tabular">
        {[...item.history].reverse().map((entry) => (
          <li key={entry.date} className="flex justify-between gap-3 py-2">
            <span className="text-text-2">{shortDate(entry.date)}</span>
            <span>
              {formatPrice(entry.price)}
              {entry.dy && <span className="text-text-2"> · DY {entry.dy.replace('.', ',')}%</span>}
              {entry.pvp && (
                <span className="text-text-2"> · P/VP {entry.pvp.replace('.', ',')}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-footnote text-text-2">
        São os preços vistos nos balanços, não o que você pagou. {lastQuote}
      </p>
    </Card>
  )
}
