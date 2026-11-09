import type { BalanceRow } from '@orla/contracts'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { axisMoney, ChartTooltip, monthTick, tick } from '@/features/finances/charts'
import { shortMonthLabel } from '@/features/finances/labels'
import { formatPercent } from '@/features/portfolio/labels'
import { prefersReducedMotion } from '@/lib/motion'

/** Evolução do patrimônio × total aportado acumulado: o vão entre as linhas é o ganho real. */
export function WealthChart({ rows }: { rows: BalanceRow[] }) {
  const data = rows.map((row) => ({
    month: row.competenceMonth,
    total: row.totalCents,
    invested: row.investedCents,
  }))
  const animate = !prefersReducedMotion()
  return (
    <div className="h-60 w-full" role="img" aria-label="Patrimônio e total aportado mês a mês">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--separator)" />
          <XAxis
            dataKey="month"
            tickFormatter={monthTick}
            tick={tick}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={axisMoney}
            tick={tick}
            axisLine={false}
            tickLine={false}
            width={56}
            domain={[0, 'auto']}
          />
          <Tooltip
            content={(props) => (
              <ChartTooltip {...(props as object)} labelFormatter={(m) => shortMonthLabel(m)} />
            )}
          />
          <Line
            dataKey="invested"
            name="Aportado"
            type="monotone"
            stroke="var(--text-3)"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            isAnimationActive={animate}
          />
          <Line
            dataKey="total"
            name="Patrimônio"
            type="monotone"
            stroke="var(--accent)"
            strokeWidth={2.5}
            dot={{ r: 2.5, fill: 'var(--accent)' }}
            isAnimationActive={animate}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Rentabilidade real mês a mês: verde (ganho) e vermelho (perda). */
export function ReturnBars({ rows }: { rows: BalanceRow[] }) {
  const data = rows
    .filter((row) => row.rate !== null)
    .map((row) => ({ month: row.competenceMonth, rate: (row.rate ?? 0) * 100 }))
  if (data.length === 0) return null
  return (
    <div className="h-52 w-full" role="img" aria-label="Rentabilidade real por mês">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--separator)" />
          <XAxis
            dataKey="month"
            tickFormatter={monthTick}
            tick={tick}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(value: number) => `${value.toFixed(1).replace('.', ',')}%`}
            tick={tick}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <ReferenceLine y={0} stroke="var(--text-3)" />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-field bg-surface px-3 py-2 text-footnote shadow-[0_8px_24px_-6px_rgb(0_0_0/0.25)]">
                  <p className="font-semibold">{shortMonthLabel(String(label))}</p>
                  <p className="tabular">
                    {formatPercent(Number(payload[0]?.value ?? 0) / 100, true)}
                  </p>
                </div>
              ) : null
            }
          />
          <Bar
            dataKey="rate"
            name="Rentabilidade"
            maxBarSize={22}
            radius={[4, 4, 4, 4]}
            isAnimationActive={!prefersReducedMotion()}
          >
            {data.map((item) => (
              <Cell
                key={item.month}
                fill={item.rate >= 0 ? 'var(--positive)' : 'var(--negative)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
