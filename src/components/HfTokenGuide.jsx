import { useState } from 'react'

export function HfTokenGuide() {
  const [open, setOpen] = useState(false)
  const step = (n, text) => (
    <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
      <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent)', color: '#000', fontSize: '.72rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{n}</div>
      <p style={{ fontSize: '.78rem', color: 'var(--muted)', lineHeight: 1.6 }}>{text}</p>
    </div>
  )
  return (
    <div style={{ marginBottom: 12 }}>
      <button
        className="btn btn-ghost btn-sm"
        style={{ fontSize: '.75rem', marginBottom: open ? 10 : 0, width: '100%', justifyContent: 'space-between' }}
        onClick={() => setOpen(o => !o)}
      >
        <span>How to get a HuggingFace token</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 14px 4px' }}>
          {step(1, 'Go to huggingface.co and click Sign Up. Create a free account — no payment needed.')}
          {step(2, 'Once logged in, open the model page: huggingface.co/litert-community/gemma-3-1b-it-litert-lm')}
          {step(3, 'Click "Agree and access repository" to accept the Gemma licence. You must do this or downloads will fail with 401.')}
          {step(4, 'Go to huggingface.co/settings/tokens and click "New token". Give it any name, set role to Read, and click Generate.')}
          {step(5, 'Copy the token (starts with hf_…) and paste it into the field below. Then click Download on your chosen model.')}
        </div>
      )}
    </div>
  )
}
