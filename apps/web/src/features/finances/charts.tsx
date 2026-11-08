/**
 * Gráficos do dashboard e da projeção (Recharts). Este módulo só é importado pelas telas
 * de gráfico, que carregam sob demanda — o Recharts fica fora do bundle inicial (RNF-02).
 * Cores vêm dos tokens (claro/escuro); animação desligada com `prefers-reduced-motion`.
 */
import { formatBRL } from '@orla/core/money'
import type { ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { prefersReducedMotion } from '@/lib/motion'
import { shortMonthLabel } from './labels'

export const compact = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
})
/** Eixo em reais compactos: 600000 centavos → "6 mil". */
export const axisMoney = (cents: number) => compact.format(cents / 100)
export const monthTick = (month: string) => shortMonthLabel(month).slice(0, 3)

export const tick = { fill: 'var(--text-2)', fontSize: 12 }

interface TooltipEntry {
  name?: string | number
  value?: number | string
  color?: string
  dataKey?: string | number
}

/** Balão do tooltip no estilo do app (superfície, sombra, valores em R$). */
export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
}: {
  active?: boolean
  payload?: readonly TooltipEntry[]
  label?: string | number
  labelFormatter?: (label: string) => ReactNode
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-field bg-surface px-3 py-2 text-footnote shadow-[0_8px_24px_-6px_rgb(0_0_0/0.25)]">
      {label !== undefined && (
        <p className="mb-1 font-semibold">
          {labelFormatter ? labelFormatter(String(label)) : label}
        </p>
      )}
      {payload.map((entry) => (
        <p key={String(entry.dataKey ?? entry.name)} className="flex items-center gap-2 tabular">
          <span className="size-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-text-2">{entry.name}</span>
          <span className="ml-auto pl-3 font-medium">{formatBRL(Number(entry.value ?? 0))}</span>
        </p>
      ))}
    </div>
  )
}

export interface DonutSlice {
  key: string
  label: string
  value: number
  color: string
}

/** Rosca de participação (gastos por categoria), com o total no meio. */
export function DonutChart({
  data,
  center,
  ariaLabel,
}: {
  data: DonutSlice[]
  center: ReactNode
  ariaLabel: string
}) {
  const animate = !prefersReducedMotion()
  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[220px]"
      role="img"
      aria-label={ariaLabel}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="68%"
            outerRadius="100%"
            paddingAngle={data.length > 1 ? 2 : 0}
            cornerRadius={4}
            stroke="none"
            startAngle={90}
            endAngle={-270}
            isAnimationActive={animate}
            animationDuration={600}
          >
            {data.map((slice) => (
              <Cell key={slice.key} fill={slice.color} />
            ))}
          </Pie>
          <Tooltip content={(props) => <ChartTooltip {...(props as object)} label={undefined} />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {center}
      </div>
    </div>
  )
}

export interface EvolutionPoint {
  month: string
  incomeCents: number
  expenseCents: number
  surplusCents: number
}

/** Evolução 12 meses: barras de entradas × saídas e a linha da sobra. */
export function EvolutionChart({ data }: { data: EvolutionPoint[] }) {
  const animate = !prefersReducedMotion()
  return (
    <div
      className="h-60 w-full"
      role="img"
      aria-label={`Entradas, saídas e sobra de ${data.length} meses`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2}>
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
          />
          <ReferenceLine y={0} stroke="var(--text-3)" />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            content={(props) => (
              <ChartTooltip {...(props as object)} labelFormatter={(m) => shortMonthLabel(m)} />
            )}
          />
          <Bar
            dataKey="incomeCents"
            name="Entradas"
            fill="var(--positive)"
            radius={[4, 4, 0, 0]}
            maxBarSize={14}
            isAnimationActive={animate}
          />
          <Bar
            dataKey="expenseCents"
            name="Saídas"
            fill="var(--negative)"
            fillOpacity={0.75}
            radius={[4, 4, 0, 0]}
            maxBarSize={14}
            isAnimationActive={animate}
          />
          <Line
            dataKey="surplusCents"
            name="Sobra"
            type="monotone"
            stroke="var(--accent)"
            strokeWidth={2.5}
            dot={{ r: 2.5, fill: 'var(--accent)' }}
            isAnimationActive={animate}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Barras por mês (compromisso de parcelas, sobra projetada). Negativos ficam em vermelho. */
export function MonthBarsChart({
  data,
  name,
  height = 180,
  color = 'var(--accent)',
  ariaLabel,
}: {
  data: { month: string; value: number }[]
  name: string
  height?: number
  color?: string
  ariaLabel: string
}) {
  const animate = !prefersReducedMotion()
  const hasNegative = data.some((item) => item.value < 0)
  return (
    <div className="w-full" style={{ height }} role="img" aria-label={ariaLabel}>
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
            tickFormatter={axisMoney}
            tick={tick}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          {hasNegative && <ReferenceLine y={0} stroke="var(--text-3)" />}
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            content={(props) => (
              <ChartTooltip {...(props as object)} labelFormatter={(m) => shortMonthLabel(m)} />
            )}
          />
          <Bar
            dataKey="value"
            name={name}
            radius={[4, 4, 4, 4]}
            maxBarSize={22}
            isAnimationActive={animate}
          >
            {data.map((item) => (
              <Cell key={item.month} fill={item.value < 0 ? 'var(--negative)' : color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
