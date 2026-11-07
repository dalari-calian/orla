import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router'
import { LogoMark } from '@/components/layout/Logo'
import { ErrorState } from '@/components/ui/States'
import { errorMessage } from '@/lib/api'
import { useMe } from './api'

function FullScreenLoading() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center"
      role="status"
      aria-label="Carregando"
    >
      <LogoMark className="size-14 animate-pulse" />
    </div>
  )
}

/**
 * Rotas que exigem login. Sem sessão → /login (lembrando para onde voltar).
 * Logado mas sem onboarding concluído → /onboarding.
 */
export function RequireAuth({
  allowIncompleteOnboarding = false,
}: {
  allowIncompleteOnboarding?: boolean
}) {
  const me = useMe()
  const location = useLocation()

  if (me.isPending) return <FullScreenLoading />
  if (me.isError) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-card bg-surface p-5 shadow-card">
          <ErrorState
            title="Não foi possível carregar sua conta"
            description={errorMessage(me.error)}
            onRetry={() => void me.refetch()}
          />
        </div>
      </div>
    )
  }
  if (!me.data) {
    const next = location.pathname + location.search
    return (
      <Navigate to={next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`} replace />
    )
  }
  if (!me.data.onboardingCompleted && !allowIncompleteOnboarding) {
    return <Navigate to="/onboarding" replace />
  }
  return <Outlet />
}

/** Login/cadastro: quem já está logado vai direto para o app. */
export function PublicOnly() {
  const me = useMe()
  const [params] = useSearchParams()
  if (me.isPending) return <FullScreenLoading />
  if (me.data) {
    const next = params.get('next')
    // Só aceita caminhos internos (evita redirecionar para outro site).
    const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : '/'
    return <Navigate to={safeNext} replace />
  }
  return <Outlet />
}
