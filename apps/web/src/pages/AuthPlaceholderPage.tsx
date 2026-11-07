import { Link } from 'react-router'
import { Logo } from '@/components/layout/Logo'
import { Card } from '@/components/ui/Card'
import { PhaseBadge } from './PlaceholderPage'

/** Login / Cadastro — tela centralizada fora da casca do app (Fase 1). */
export function AuthPlaceholderPage({ mode }: { mode: 'login' | 'signup' }) {
  const title = mode === 'login' ? 'Entrar' : 'Criar conta'
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm p-6 text-center md:p-8">
        <Logo />
        <h1 className="mt-6 text-title-1 font-bold">{title}</h1>
        <p className="mt-2 text-subhead text-text-2">
          Usuário e senha{mode === 'signup' ? ', com código de convite' : ''}. Chega na Fase 1.
        </p>
        <div className="mt-4">
          <PhaseBadge phase={1} />
        </div>
        <Link
          to="/"
          className="mt-6 inline-flex min-h-11 items-center text-subhead font-medium text-accent"
        >
          Voltar para o início
        </Link>
      </Card>
    </div>
  )
}
