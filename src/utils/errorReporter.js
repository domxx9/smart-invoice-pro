import { logger } from './logger.js'

const MAX_REPORTED = 50
let _reported = []

export function reportError(err, context = {}) {
  if (_reported.length >= MAX_REPORTED) return
  const entry = {
    id: Date.now(),
    message: err?.message || String(err),
    name: err?.name || 'Error',
    stack: err?.stack || '',
    context,
    ts: new Date().toISOString(),
  }
  _reported.push(entry)
  logger.error('error-reporter', entry.name, entry.message, context)
}

export function getReportedErrors() {
  return _reported.slice()
}

export function clearReportedErrors() {
  _reported = []
}
