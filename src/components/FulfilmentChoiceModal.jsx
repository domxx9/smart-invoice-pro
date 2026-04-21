export function FulfilmentChoiceModal({ invoiceId, onPicker, onSkip, onClose }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Fulfil invoice ${invoiceId}`}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 45,
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'var(--card)',
          color: 'var(--text)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          maxWidth: 380,
          width: '100%',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Fulfil {invoiceId}</h3>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: '.78rem',
              color: 'var(--muted)',
              lineHeight: 1.5,
            }}
          >
            How do you want to fulfil this invoice?
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-full" onClick={onPicker}>
          Go to Picker
        </button>
        <button type="button" className="btn btn-ghost btn-full" onClick={onSkip}>
          Skip picking — mark fulfilled now
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onClose}
          style={{ alignSelf: 'center' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
