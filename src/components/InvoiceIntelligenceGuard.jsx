export function InvoiceIntelligenceGuard({ issues, onDismiss }) {
  if (!issues || issues.length === 0) return null

  const hasHigh = issues.some((i) => i.severity === 'HIGH')
  const header = hasHigh ? 'High Priority Issues' : 'Invoice Review'

  return (
    <div
      className="card"
      style={{ borderLeft: '3px solid var(--warning, #f59e0b)', marginBottom: 12 }}
    >
      <div className="flex-between">
        <strong style={{ fontSize: '.85rem' }}>{header}</strong>
        {onDismiss && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onDismiss}
            style={{ fontSize: '.75rem' }}
          >
            Dismiss
          </button>
        )}
      </div>
      <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '.8rem' }}>
        {issues.map((issue, i) => (
          <li key={i}>{issue.message || String(issue)}</li>
        ))}
      </ul>
    </div>
  )
}
