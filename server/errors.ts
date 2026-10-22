/**
 * RFC 7807 Problem Details error definitions and normalizers.
 * Provides consistent, structured error payloads across all BFF endpoints.
 */

import type { Request, Response, NextFunction } from 'express'

export interface ProblemDetails {
  type: string
  title: string
  status: number
  detail: string
  errorCode: string
  instance?: string
  timestamp: string
  invalidParams?: unknown
}

export class AppError extends Error {
  public readonly statusCode: number
  public readonly errorCode: string
  public readonly details?: unknown

  constructor(message: string, statusCode = 500, errorCode = 'ERR_INTERNAL_SERVER_ERROR', details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.errorCode = errorCode
    this.details = details
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export function formatProblemDetails(err: unknown, instancePath?: string): ProblemDetails {
  const timestamp = new Date().toISOString()
  if (err instanceof AppError) {
    return {
      type: `https://inji.mosip.io/errors/${err.errorCode.toLowerCase().replace(/_/g, '-')}`,
      title: err.name,
      status: err.statusCode,
      detail: err.message,
      errorCode: err.errorCode,
      instance: instancePath,
      timestamp,
      invalidParams: err.details,
    }
  }

  const message = err instanceof Error ? err.message : String(err)
  return {
    type: 'https://inji.mosip.io/errors/internal-error',
    title: 'Internal Server Error',
    status: 500,
    detail: message,
    errorCode: 'ERR_UNHANDLED_EXCEPTION',
    instance: instancePath,
    timestamp,
  }
}

export function errorHandlerMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const problem = formatProblemDetails(err, req.originalUrl || req.url)
  console.error(`[error] [${req.method} ${req.url}] ${problem.errorCode}: ${problem.detail}`)
  res.status(problem.status).json(problem)
}
