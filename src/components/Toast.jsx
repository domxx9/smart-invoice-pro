export function Toast({ toasts, onDismiss }) {
  return (
    <div style={{
      position: 'fixed', bottom: 82, left: 0, right: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 8, zIndex: 9990, pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div key={t.id}
          onClick={() => onDismiss(t.id)}
          style={{
            background:
              t.type === 'error'   ? '#7f1d1d' :
              t.type === 'success' ? '#14532d' :
              'var(--card)',
            border: `1px solid ${
              t.type === 'error'   ? '#e05252' :
              t.type === 'success' ? '#4caf84' :
              'var(--accent)'}`,
            color: '#f0f0f0',
            borderRadius: 10,
            padding: '10px 18px',
            fontSize: '.83rem',
            fontWeight: 500,
            boxShadow: '0 4px 24px rgba(0,0,0,.5)',
            animation: 'toast-in .22s cubic-bezier(.34,1.56,.64,1)',
            pointerEvents: 'auto',
            maxWidth: 300,
            textAlign: 'center',
            cursor: 'pointer',
          }}>
          {t.icon && <span style={{ marginRight: 6 }}>{t.icon}</span>}
          {t.message}
        </div>
      ))}
    </div>
  )
}
