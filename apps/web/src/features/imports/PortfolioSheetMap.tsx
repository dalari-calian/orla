import type { Account } from '@orla/contracts'
import type { InitialPosition } from '@orla/core/import'
import { normalizeText } from '@orla/core/import'
import { formatBRL } from '@orla/core/money'
import { useId } from 'react'
import { CardHeader } from '@/components/ui/Card'
import { TextField } from '@/components/ui/Field'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { SelectField } from '@/components/ui/Select'
import { shortDate } from '@/features/finances/labels'

/**
 * Passo 3 da planilha da carteira: corretora, nomes de renda fixa que são o mesmo
 * investimento e o preço médio da posição anterior aos aportes (decisão do dono: PM editável).
 */
export function PortfolioSheetMap({
  accounts,
  accountName,
  onAccountName,
  labels,
  names,
  onName,
  positions,
  prices,
  onPrice,
  values,
  onValue,
}: {
  accounts: Account[]
  accountName: string
  onAccountName: (value: string) => void
  labels: { label: string; count: number }[]
  names: Record<string, string>
  onName: (key: string, value: string) => void
  positions: InitialPosition[]
  prices: Record<string, string>
  onPrice: (key: string, value: string) => void
  values: Record<string, number | null>
  onValue: (key: string, value: number | null) => void
}) {
  const listId = useId()
  const chosen = [...new Set(Object.values(names).filter(Boolean))].sort()
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <CardHeader title="Corretora" />
        <SelectField
          label="Onde ficam os ativos"
          value={accountName}
          onChange={(event) => onAccountName(event.target.value)}
          hint="Mesmo ticker em corretoras diferentes vira dois ativos (dá para separar depois)."
        >
          <option value="">Não informar</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.name}>
              {account.name}
            </option>
          ))}
        </SelectField>
      </section>

      {labels.length > 0 && (
        <section className="space-y-3">
          <CardHeader title="Renda fixa: junte os nomes iguais" />
          <p className="text-subhead text-text-2">
            A planilha chama o mesmo investimento de jeitos diferentes (no aporte e no balanço). Dê
            o mesmo nome aos que são um só — eles viram um ativo.
          </p>
          <datalist id={listId}>
            {chosen.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <ul className="space-y-3">
            {labels.map(({ label, count }) => {
              const key = normalizeText(label)
              return (
                <li
                  key={key}
                  className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-3"
                >
                  <span className="min-w-0 text-subhead">
                    <span className="block truncate font-medium">{label}</span>
                    <span className="text-caption text-text-2">
                      {count} {count === 1 ? 'vez' : 'vezes'} na planilha
                    </span>
                  </span>
                  <TextField
                    label={`Ativo no Orla para ${label}`}
                    list={listId}
                    value={names[key] ?? ''}
                    onChange={(event) => onName(key, event.target.value)}
                  />
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {positions.length > 0 && (
        <section className="space-y-3">
          <CardHeader title="O que você já tinha antes dos aportes" />
          <p className="text-subhead text-text-2">
            Calculado pelo 1º balanço da planilha (quantidade − compras até ele). O preço médio vem
            com o preço daquele balanço: troque pelo seu PM real, se souber.
          </p>
          <ul className="space-y-3">
            {positions.map((position) => (
              <li
                key={position.key}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,9rem)] items-end gap-3"
              >
                <span className="min-w-0 pb-2 text-subhead">
                  <span className="block truncate font-medium">{position.key}</span>
                  <span className="block text-caption text-text-2">
                    {position.quantity
                      ? `${position.quantity} cotas · balanço de ${shortDate(position.balanceDate)}`
                      : `Saldo menos aportes · balanço de ${shortDate(position.balanceDate)}`}
                  </span>
                </span>
                {position.quantity ? (
                  <TextField
                    label="Preço médio (R$)"
                    inputMode="decimal"
                    value={
                      prices[position.key] ?? (position.suggestedPrice ?? '').replace('.', ',')
                    }
                    onChange={(event) => onPrice(position.key, event.target.value)}
                  />
                ) : (
                  <MoneyInput
                    label="Valor aplicado"
                    value={values[position.key] ?? position.valueCents}
                    onChange={(value) => onValue(position.key, value)}
                    hint={
                      position.valueCents
                        ? `Sugerido: ${formatBRL(position.valueCents)}`
                        : undefined
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
