import {
  loginRequestSchema,
  registerRequestSchema,
  updateProfileRequestSchema,
  type AuthConfigResponse,
} from '@orla/contracts'
import type { PrismaClient } from '@orla/db'
import { Router, type Request } from 'express'
import { rateLimited, unauthorized } from '../lib/errors.ts'
import type { RateLimiter } from '../lib/rate-limit.ts'
import { parse } from '../lib/validate.ts'
import {
  REFRESH_COOKIE,
  clearSessionCookies,
  readCookie,
  requireAuth,
  setSessionCookies,
  userIdOf,
} from '../middleware/auth.ts'
import type { AuthService, ClientInfo } from '../services/auth.ts'

export interface AuthRouterDeps {
  prisma: PrismaClient
  auth: AuthService
  secureCookies: boolean
  loginLimiter: RateLimiter
  signupLimiter: RateLimiter
}

const clientInfo = (req: Request): ClientInfo => ({
  userAgent: req.headers['user-agent'],
  ip: req.ip,
})

/** /auth/* — cadastro, login, refresh, logout e perfil. */
export function authRouter({
  prisma,
  auth,
  secureCookies,
  loginLimiter,
  signupLimiter,
}: AuthRouterDeps): Router {
  const router = Router()

  router.get('/auth/config', (_req, res) => {
    const body: AuthConfigResponse = { signupMode: auth.signupMode() }
    res.json(body)
  })

  router.post('/auth/register', async (req, res) => {
    if (!signupLimiter.consume(`signup:${req.ip}`)) throw rateLimited()
    const input = parse(registerRequestSchema, req.body)
    const { me, tokens } = await auth.register(input, clientInfo(req))
    setSessionCookies(res, tokens, secureCookies)
    res.status(201).json(me)
  })

  router.post('/auth/login', async (req, res) => {
    const input = parse(loginRequestSchema, req.body)
    // RNF-22: 5 tentativas/min por IP + usuário.
    const key = `login:${req.ip}:${input.username}`
    if (!loginLimiter.consume(key)) throw rateLimited()
    const { me, tokens } = await auth.login(input, clientInfo(req))
    loginLimiter.reset(key)
    setSessionCookies(res, tokens, secureCookies)
    res.json(me)
  })

  router.post('/auth/refresh', async (req, res) => {
    const token = readCookie(req, REFRESH_COOKIE)
    try {
      if (!token) throw unauthorized('Sessão expirada. Faça login de novo.')
      const { me, tokens } = await auth.refresh(token, clientInfo(req))
      setSessionCookies(res, tokens, secureCookies)
      res.json(me)
    } catch (error) {
      // Refresh falhou: limpa os cookies para o front cair no login.
      clearSessionCookies(res, secureCookies)
      throw error
    }
  })

  router.post('/auth/logout', async (req, res) => {
    await auth.logout(readCookie(req, REFRESH_COOKIE))
    clearSessionCookies(res, secureCookies)
    res.status(204).end()
  })

  router.get('/auth/me', requireAuth(auth), async (req, res) => {
    res.json(await auth.me(userIdOf(req)))
  })

  router.patch('/auth/me', requireAuth(auth), async (req, res) => {
    const input = parse(updateProfileRequestSchema, req.body)
    const userId = userIdOf(req)
    await prisma.user.update({
      where: { id: userId },
      data: { displayName: input.displayName || null },
    })
    res.json(await auth.me(userId))
  })

  return router
}
