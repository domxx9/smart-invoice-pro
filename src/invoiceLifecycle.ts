// TEST: deliberate type error — revert this line to restore
const _ciTest: number = 'this-will-break-typecheck'

export const STATUSES = [
  'new',
  'pending',
  'fulfilled',
  'paid',
  'refunded',
  'cancelled',
] as const

export type InvoiceStatus = (typeof STATUSES)[number]

export const TRANSITIONS: Readonly<Record<InvoiceStatus, readonly InvoiceStatus[]>> = {
  new: ['pending', 'cancelled'],
  pending: ['fulfilled', 'cancelled'],
  fulfilled: ['paid', 'cancelled'],
  paid: ['refunded'],
  refunded: [],
  cancelled: [],
} as const

export function isStatus(value: unknown): value is InvoiceStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value)
}

export function canTransition(from: unknown, to: unknown): boolean {
  if (!isStatus(from) || !isStatus(to)) return false
  if (from === to) return true
  return TRANSITIONS[from].includes(to)
}

export function assertTransition(from: unknown, to: unknown): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid invoice status transition: ${String(from)} → ${String(to)}`)
  }
}
