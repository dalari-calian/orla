import type { RequestHandler } from 'express'
import { forbidden } from '../lib/errors.ts'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * RNF-20: CSRF via SameSite=Lax + checagem de Origin nas escritas. Requisições sem
 * Origin (curl, app nativo com Bearer) passam; com Origin diferente do front, 403.
 */
export function originCheck(allowedOrigin: string): RequestHandler {
  const allowed = new URL(allowedOrigin).origin
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next()
    const origin = req.headers.origin
    if (origin && origin !== allowed) throw forbidden('Origem não permitida.')
    next()
  }
}
