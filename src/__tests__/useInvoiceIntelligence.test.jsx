import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { render, screen, fireEvent } from '@testing-library/react'
import { SEVERITY } from '../hooks/useInvoiceIntelligence.js'
import { useInvoiceIntelligence } from '../hooks/useInvoiceIntelligence.js'
import { InvoiceIntelligenceGuard } from '../components/InvoiceIntelligenceGuard.jsx'

vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn() },
  ImpactStyle: { MEDIUM: 'MEDIUM', Medium: 'MEDIUM' },
}))

function buildInvoice(items) {
  return { id: 'INV-0001', items }
}
function buildProducts(list) {
  return list.map((n, i) => ({ name: n, price: 100 + i * 50 }))
}

describe('useInvoiceIntelligence — duplicate detection', () => {
  it('returns empty when invoice has no items', () => {
    const { result } = renderHook(() =>
      useInvoiceIntelligence({ invoice: { items: [] }, products: [] }),
    )
    expect(result.current.issues).toHaveLength(0)
    expect(result.current.hasIssues).toBe(false)
  })

  it('returns empty when invoice is null', () => {
    const { result } = renderHook(() => useInvoiceIntelligence({ invoice: null, products: [] }))
    expect(result.current.issues).toHaveLength(0)
    expect(result.current.hasIssues).toBe(false)
  })

  it('detects identical-description duplicates', () => {
    const invoice = buildInvoice([
      { desc: 'Logo Design', qty: 1, price: 500 },
      { desc: 'Logo Design', qty: 2, price: 1000 },
    ])
    const { result } = renderHook(() => useInvoiceIntelligence({ invoice, products: [] }))
    expect(result.current.hasIssues).toBe(true)
    const dup = result.current.issues.find((i) => i.type === 'duplicate')
    expect(dup).toBeDefined()
    expect(dup.severity).toBe(SEVERITY.MEDIUM)
    expect(dup.lineA).toBe(0)
    expect(dup.lineB).toBe(1)
    expect(dup.message).toContain('Lines 1 and 2')
  })

  it('ignores empty-description lines in duplicate check', () => {
    const invoice = buildInvoice([
      { desc: '', qty: 1, price: 100 },
      { desc: '', qty: 2, price: 200 },
    ])
    const { result } = renderHook(() => useInvoiceIntelligence({ invoice, products: [] }))
    expect(result.current.hasIssues).toBe(false)
  })

  it('finds all duplicate pairs in three identical lines', () => {
    const invoice = buildInvoice([
      { desc: 'X', qty: 1, price: 100 },
      { desc: 'X', qty: 1, price: 100 },
      { desc: 'X', qty: 1, price: 100 },
    ])
    const { result } = renderHook(() => useInvoiceIntelligence({ invoice, products: [] }))
    expect(result.current.issues.filter((i) => i.type === 'duplicate')).toHaveLength(3)
  })
})

describe('useInvoiceIntelligence — price anomaly detection', () => {
  it('flags price ≥20% above catalog as MEDIUM anomaly', () => {
    const invoice = buildInvoice([{ desc: 'Web Design', qty: 1, price: 3000 }])
    const products = [{ name: 'Web Design', price: 2500 }]
    const { result } = renderHook(() => useInvoiceIntelligence({ invoice, products }))
    const anom = result.current.issues.find((i) => i.type === 'anomaly')
    expect(anom).toBeDefined()
    expect(anom.severity).toBe(SEVERITY.MEDIUM)
    expect(anom.expectedPrice).toBe(2500)
    expect(anom.actualPrice).toBe(3000)
  })

  it('escalates to HIGH when price differs ≥40% from catalog', () => {
    const invoice = buildInvoice([{ desc: 'Web Design', qty: 1, price: 3600 }])
    const products = [{ name: 'Web Design', price: 2500 }]
    const { result } = renderHook(() => useInvoiceIntelligence({ invoice, products }))
    const anom = result.current.issues.find((i) => i.type === 'anomaly')
    expect(anom.severity).toBe(SEVERITY.HIGH)
  })

  it('does not flag prices within 20% of catalog', () => {
    const invoice = buildInvoice([{ desc: 'Web Design', qty: 1, price: 115 }])
    const products = buildProducts(['Web Design'])
    const { result } = renderHook(() => useInvoiceIntelligence({ invoice, products }))
    expect(result.current.issues.some((i) => i.type === 'anomaly')).toBe(false)
  })

  it('ignores lines with no description in anomaly check', () => {
    const invoice = buildInvoice([{ desc: '', qty: 1, price: 9999 }])
    const products = buildProducts(['Something'])
    const { result } = renderHook(() => useInvoiceIntelligence({ invoice, products }))
    expect(result.current.issues.some((i) => i.type === 'anomaly')).toBe(false)
  })

  it('ignores zero price in anomaly check', () => {
    const invoice = buildInvoice([{ desc: 'Thing', qty: 1, price: 0 }])
    const products = buildProducts(['Thing'])
    const { result } = renderHook(() => useInvoiceIntelligence({ invoice, products }))
    expect(result.current.issues.some((i) => i.type === 'anomaly')).toBe(false)
  })

  it('matches by exact lowercased description', () => {
    const invoice = buildInvoice([{ desc: 'WEB DESIGN', qty: 1, price: 3000 }])
    const products = [{ name: 'web design', price: 100 }]
    const { result } = renderHook(() => useInvoiceIntelligence({ invoice, products }))
    expect(result.current.issues.some((i) => i.type === 'anomaly')).toBe(true)
  })
})

describe('useInvoiceIntelligence — combined', () => {
  it('detects both duplicates and anomalies in same invoice', () => {
    const invoice = buildInvoice([
      { desc: 'Logo Design', qty: 1, price: 500 },
      { desc: 'Logo Design', qty: 1, price: 3000 },
    ])
    const products = [{ name: 'Logo Design', price: 500 }]
    const { result } = renderHook(() => useInvoiceIntelligence({ invoice, products }))
    expect(result.current.issues.some((i) => i.type === 'duplicate')).toBe(true)
    expect(result.current.issues.some((i) => i.type === 'anomaly')).toBe(true)
  })
})

describe('InvoiceIntelligenceGuard', () => {
  it('returns null when issues is empty', () => {
    const { container } = render(<InvoiceIntelligenceGuard issues={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders all issue messages', () => {
    const issues = [
      {
        id: 'dup-0-1',
        type: 'duplicate',
        severity: SEVERITY.MEDIUM,
        lineA: 0,
        lineB: 1,
        message: 'Lines 1 and 2 have identical descriptions',
      },
      {
        id: 'anom-0',
        type: 'anomaly',
        severity: SEVERITY.HIGH,
        line: 0,
        expectedPrice: 100,
        actualPrice: 400,
        message: 'Line 1 price is 300% higher',
      },
    ]
    render(<InvoiceIntelligenceGuard issues={issues} />)
    expect(screen.getByText('Lines 1 and 2 have identical descriptions')).toBeInTheDocument()
    expect(screen.getByText('Line 1 price is 300% higher')).toBeInTheDocument()
  })

  it('shows "High Priority Issues" when HIGH severity present', () => {
    const issues = [
      {
        id: 'anom-0',
        type: 'anomaly',
        severity: SEVERITY.HIGH,
        line: 0,
        expectedPrice: 100,
        actualPrice: 400,
        message: 'Big diff',
      },
    ]
    render(<InvoiceIntelligenceGuard issues={issues} />)
    expect(screen.getByText('High Priority Issues')).toBeInTheDocument()
  })

  it('shows "Invoice Review" for MEDIUM/LOW only', () => {
    const issues = [
      {
        id: 'dup-0-1',
        type: 'duplicate',
        severity: SEVERITY.MEDIUM,
        lineA: 0,
        lineB: 1,
        message: 'Dupe',
      },
    ]
    render(<InvoiceIntelligenceGuard issues={issues} />)
    expect(screen.getByText('Invoice Review')).toBeInTheDocument()
  })

  it('calls onDismiss when dismiss button clicked', () => {
    const onDismiss = vi.fn()
    const issues = [
      {
        id: 'dup-0-1',
        type: 'duplicate',
        severity: SEVERITY.MEDIUM,
        lineA: 0,
        lineB: 1,
        message: 'Dupe',
      },
    ]
    render(<InvoiceIntelligenceGuard issues={issues} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('omits dismiss button when onDismiss not provided', () => {
    const issues = [
      {
        id: 'dup-0-1',
        type: 'duplicate',
        severity: SEVERITY.MEDIUM,
        lineA: 0,
        lineB: 1,
        message: 'Dupe',
      },
    ]
    render(<InvoiceIntelligenceGuard issues={issues} />)
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
  })
})
