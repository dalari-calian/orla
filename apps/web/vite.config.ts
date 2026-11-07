import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig(({ mode }) => {
  // Lê o .env da raiz do monorepo (só usamos API_PORT aqui; nada vai para o bundle).
  const env = loadEnv(mode, repoRoot, '')
  const apiPort = env.API_PORT ?? '3333'

  return {
    plugins: [react(), tailwindcss()],
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
  }
})
