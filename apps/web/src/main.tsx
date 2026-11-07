import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { ToastProvider } from '@/components/ui/Toast'
import { meQueryKey } from '@/features/auth/api'
import { ApiRequestError, setSessionExpiredHandler } from '@/lib/api'
import { router } from '@/routes/router'
import '@/styles/globals.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // Não insiste em erros de cliente (400/401/404): só em falhas de rede/servidor.
      retry: (failureCount, error) =>
        failureCount < 1 && !(error instanceof ApiRequestError && error.status < 500),
    },
  },
})

// Sessão expirou de vez: esquece o usuário e a guarda de rota leva para o login.
setSessionExpiredHandler(() => {
  queryClient.clear()
  queryClient.setQueryData(meQueryKey, null)
})

const root = document.getElementById('root')
if (!root) throw new Error('Elemento #root não encontrado')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
