import { defineConfig } from 'prisma/config'
import { loadRootEnv } from './src/load-env.ts'

loadRootEnv()

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` não precisa de banco; o placeholder evita erro no CI.
    url:
      process.env.DATABASE_URL ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
  },
})
