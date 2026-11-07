import { createBrowserRouter, type RouteObject } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage, SignupPage } from '@/features/auth/AuthPages'
import { PublicOnly, RequireAuth } from '@/features/auth/guards'
import { OnboardingPage } from '@/features/onboarding/OnboardingPage'
import {
  AccountsPage,
  CategoriesPage,
  CreditCardsPage,
  PayeesPage,
} from '@/features/registrations/pages'
import { ConfigPage } from '@/pages/ConfigPage'
import { HomePage } from '@/pages/HomePage'
import { MorePage } from '@/pages/MorePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { screens, screensOf, sections, sectionScreens, type Section } from './screens'

/** Telas já implementadas (as demais do mapa de navegação ficam como placeholder). */
const implemented: RouteObject[] = [
  { path: '/config', element: <ConfigPage /> },
  { path: '/config/contas', element: <AccountsPage /> },
  { path: '/config/cartoes', element: <CreditCardsPage /> },
  { path: '/config/categorias', element: <CategoriesPage /> },
  { path: '/config/estabelecimentos', element: <PayeesPage /> },
]
const implementedPaths = new Set(implemented.map((route) => route.path))

/** Página-índice de uma seção (Finanças, Carteira...), listando as telas dela. */
function sectionRoute(key: Section['key']): RouteObject {
  const section = sections.find((item) => item.key === key)
  if (!section) throw new Error(`Seção desconhecida: ${key}`)
  const info = sectionScreens[key]
  return {
    path: section.path,
    element: (
      <PlaceholderPage
        title={section.title}
        description={info.description}
        phase={info.phase}
        children={screensOf(key)}
      />
    ),
  }
}

/** Telas internas ainda não implementadas: placeholder até a fase de cada uma. */
const placeholderRoutes: RouteObject[] = screens
  .filter((screen) => !implementedPaths.has(screen.path))
  .map((screen) => {
    const section = sections.find((item) => item.key === screen.section)
    return {
      path: screen.path,
      element: (
        <PlaceholderPage
          title={screen.title}
          description={screen.description}
          phase={screen.phase}
          back={section ? { to: section.path, label: section.title } : undefined}
        />
      ),
    }
  })

export const router = createBrowserRouter([
  {
    element: <PublicOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/cadastro', element: <SignupPage /> },
    ],
  },
  {
    element: <RequireAuth allowIncompleteOnboarding />,
    children: [{ path: '/onboarding', element: <OnboardingPage /> }],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          sectionRoute('financas'),
          sectionRoute('carteira'),
          sectionRoute('aporte'),
          sectionRoute('balanco'),
          { path: '/mais', element: <MorePage /> },
          ...implemented,
          ...placeholderRoutes,
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])
