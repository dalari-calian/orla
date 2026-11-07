import type { CookieOptions, Request, RequestHandler, Response } from 'express'
import { parseCookies } from '../lib/cookies.ts'
import { unauthorized } from '../lib/errors.ts'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  type AuthService,
  type SessionTokens,
} from '../services/auth.ts'

export const ACCESS_COOKIE = 'orla_at'
export const REFRESH_COOKIE = 'orla_rt'
/** O refresh token só viaja nas rotas de auth. */
const REFRESH_COOKIE_PATH = '/api/v1/auth'

export function cookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'lax' }
}

export function setSessionCookies(res: Response, tokens: SessionTokens, secure: boolean): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...cookieOptions(secure),
    path: '/',
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
  })
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...cookieOptions(secure),
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  })
}

export function clearSessionCookies(res: Response, secure: boolean): void {
  res.clearCookie(ACCESS_COOKIE, { ...cookieOptions(secure), path: '/' })
  res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(secure), path: REFRESH_COOKIE_PATH })
}

export function readCookie(req: Request, name: string): string | undefined {
  return parseCookies(req.headers.cookie)[name]
}

/**
 * Exige sessão válida e injeta `req.userId` (regra 4: o usuário vem sempre da sessão,
 * nunca do cliente). Aceita também `Authorization: Bearer` (app nativo/bot no futuro).
 */
export function requireAuth(auth: AuthService): RequestHandler {
  return (req, _res, next) => {
    const header = req.headers.authorization
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined
    const token = bearer ?? readCookie(req, ACCESS_COOKIE)
    const userId = token ? auth.verifyAccessToken(token) : null
    if (!userId) throw unauthorized()
    req.userId = userId
    next()
  }
}

/** userId da sessão (só use em rotas atrás de `requireAuth`). */
export function userIdOf(req: Request): string {
  if (!req.userId) throw unauthorized()
  return req.userId
}
