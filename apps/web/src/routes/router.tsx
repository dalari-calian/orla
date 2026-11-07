import { createBrowserRouter, type RouteObject } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { AuthPlaceholderPage } from '@/pages/AuthPlaceholderPage'
import { ConfigPage } from '@/pages/ConfigPage'
import { HomePage } from '@/pages/HomePage'
import { MorePage } from '@/pages/MorePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { screens, screensOf, sections, sectionScreens, type Section } from './screens'

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

/** Telas internas (placeholders até a fase de cada uma). */
const screenRoutes: RouteObject[] = screens.map((screen) => {
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
  { path: '/login', element: <AuthPlaceholderPage mode="login" /> },
  { path: '/cadastro', element: <AuthPlaceholderPage mode="signup" /> },
  {
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      sectionRoute('financas'),
      sectionRoute('carteira'),
      sectionRoute('aporte'),
      sectionRoute('balanco'),
      { path: '/config', element: <ConfigPage /> },
      { path: '/mais', element: <MorePage /> },
      ...screenRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
