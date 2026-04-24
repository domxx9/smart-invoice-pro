import { useMemo } from 'react'

export function useInvoiceIntelligence({ invoice, products } = {}) {
  const issues = useMemo(() => {
    if (!invoice) return []
    const found = []

    if (!invoice.customer || !String(invoice.customer).trim()) {
      found.push('Customer name is missing')
    }

    if (!invoice.items || invoice.items.length === 0) {
      found.push('Invoice has no line items')
    } else {
      invoice.items.forEach((item, i) => {
        const n = i + 1
        if (!item.desc || !String(item.desc).trim()) {
          found.push(`Line item ${n} has no description`)
        }
        const price = parseFloat(item.price)
        if (
          item.price === '' ||
          item.price === undefined ||
          item.price === null ||
          isNaN(price) ||
          price <= 0
        ) {
          found.push(`Line item ${n} has no price`)
        }
        const qty = parseFloat(item.qty)
        if (isNaN(qty) || qty <= 0) {
          found.push(`Line item ${n} has zero or negative quantity`)
        }
      })
    }

    if (invoice.date && invoice.due && invoice.due < invoice.date) {
      found.push('Due date is before the invoice date')
    }

    return found
  }, [invoice, products])

  return { issues, hasIssues: issues.length > 0 }
export function useInvoiceIntelligence() {
  return { issues: [], hasIssues: false }
}
