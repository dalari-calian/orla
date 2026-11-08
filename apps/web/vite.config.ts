import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig(({ mode }) => {
  // Lê o .env da raiz do monorepo (só usamos API_PORT aqui; nada vai para o bundle).
  const env = loadEnv(mode, repoRoot, '')
  const apiPort = env.API_PORT ?? '3333'

  return {
    plugins: [
      react(),
      tailwindcss(),
      // PWA instalável (RNF-10/11): manifest + service worker gerado no build (não roda no dev).
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'Orla — finanças e carteira',
          short_name: 'Orla',
          description: 'Controle financeiro e carteira de investimentos.',
          lang: 'pt-BR',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#F2F2F7',
          theme_color: '#F2F2F7',
          icons: [
            { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: '/pwa-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // O shell (HTML/JS/CSS) fica em cache; navegação offline cai no index.html.
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          // Leitura offline (RNF-11): GETs da API em rede primeiro, cache como reserva.
          // O cache é apagado ao trocar de sessão (features/auth/api.ts).
          runtimeCaching: [
            {
              urlPattern: ({ url, request }) =>
                url.pathname.startsWith('/api/v1/') && request.method === 'GET',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'orla-api',
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 14 },
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      strictPort: true,
      // Mesma origem em dev: o front chama /api e o Vite repassa para a API Express.
      proxy: {
        '/api': { target: `http://localhost:${apiPort}` },
      },
    },
    // `pnpm --filter @orla/web preview`: o build de produção (com o service worker) e o mesmo proxy.
    preview: {
      port: 4173,
      proxy: {
        '/api': { target: `http://localhost:${apiPort}` },
      },
    },
  }
})
