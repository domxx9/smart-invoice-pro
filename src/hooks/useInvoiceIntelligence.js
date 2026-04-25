export const SEVERITY = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
}

export function useInvoiceIntelligence({ invoice, products }) {
  if (!invoice || !invoice.items || invoice.items.length === 0) {
    return { issues: [], hasIssues: false }
  }

  const issues = []
  const catalog = new Map(products.map((p) => [p.name.toLowerCase(), p.price]))

  for (let i = 0; i < invoice.items.length; i++) {
    for (let j = i + 1; j < invoice.items.length; j++) {
      const a = invoice.items[i]
      const b = invoice.items[j]
      if (a.desc && a.desc.toLowerCase() === b.desc.toLowerCase() && a.desc.trim() !== '') {
        issues.push({
          id: `dup-${i}-${j}`,
          type: 'duplicate',
          severity: SEVERITY.MEDIUM,
          lineA: i,
          lineB: j,
          message: `Lines ${i + 1} and ${j + 1} have identical descriptions`,
        })
      }
    }
  }

  invoice.items.forEach((item, idx) => {
    if (!item.desc || item.desc.trim() === '' || item.price === 0) return
    const catalogPrice = catalog.get(item.desc.toLowerCase())
    if (catalogPrice === undefined) return
    const diff = item.price / catalogPrice
    if (diff >= 1.4) {
      issues.push({
        id: `anom-${idx}`,
        type: 'anomaly',
        severity: SEVERITY.HIGH,
        line: idx,
        expectedPrice: catalogPrice,
        actualPrice: item.price,
        message: `Line ${idx + 1} price is ${Math.round((diff - 1) * 100)}% higher`,
      })
    } else if (diff >= 1.2) {
      issues.push({
        id: `anom-${idx}`,
        type: 'anomaly',
        severity: SEVERITY.MEDIUM,
        line: idx,
        expectedPrice: catalogPrice,
        actualPrice: item.price,
        message: `Line ${idx + 1} price is ${Math.round((diff - 1) * 100)}% higher`,
      })
    }
  })

  return { issues, hasIssues: issues.length > 0 }
}
