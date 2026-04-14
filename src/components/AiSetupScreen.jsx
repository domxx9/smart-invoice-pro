import { useState } from 'react'
import {
  MODELS as AI_MODELS,
  downloadModel as gemmaDownload,
  cancelDownload as gemmaCancelDownload,
} from '../onnxRuntime.js'

export function AiSetupScreen({ onDone }) {
  const [hfToken, setHfToken] = useState(() => localStorage.getItem('sip_hf_token') || '')
  const [phase, setPhase]     = useState('prompt') // prompt | downloading | done | error
  const [progress, setProgress] = useState(0)
  const [errMsg, setErrMsg]   = useState('')

  const model = AI_MODELS.small
  const isPublic = !!model.public && model.url !== 'GDRIVE_PLACEHOLDER'

  const startDownload = async (token) => {
    const t = token.trim()
    if (t) localStorage.setItem('sip_hf_token', t)
    setPhase('downloading')
    setProgress(0)
    try {
      await gemmaDownload('small', (frac) => setProgress(frac), isPublic ? undefined : (t || undefined))
      setPhase('done')
    } catch (e) {
      if (e.name === 'AbortError') { setPhase('prompt'); return }
      setErrMsg(e.message)
      setPhase('error')
    }
  }

  const wrap = (children) => (
    <div style={{
      minHeight: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 'calc(env(safe-area-inset-top, 0) + 32px) 24px 32px',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>{children}</div>
    </div>
  )

  if (phase === 'prompt') return wrap(
    <>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent)', marginBottom: 8 }}>Set up on-device AI</h2>
        <p style={{ color: 'var(--muted)', fontSize: '.88rem', lineHeight: 1.6 }}>
          Download a small AI model ({model.size}) that runs fully on your device to improve product matching in Smart Paste.
        </p>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontWeight: 600, fontSize: '.9rem' }}>{model.label}</span>
          <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{model.size}</span>
        </div>
        <p style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{model.description} · one-time download · zero network after</p>
      </div>
      {!isPublic && (
        <div className="field">
          <label>HuggingFace Token <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(required)</span></label>
          <input
            type="password"
            placeholder="hf_…"
            value={hfToken}
            onChange={e => setHfToken(e.target.value)}
          />
          <p style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
            Free account at huggingface.co → Settings → Tokens → New token (Read).
            Accept the model licence at huggingface.co/litert-community/gemma-3-270m-it-litert-lm first.
          </p>
        </div>
      )}
      <button
        className="btn btn-primary btn-full"
        style={{ marginBottom: 10 }}
        disabled={!isPublic && !hfToken.trim()}
        onClick={() => startDownload(hfToken)}
      >
        Download &amp; Set Up AI
      </button>
      <button className="btn btn-ghost btn-full" onClick={onDone}>Skip for now</button>
    </>
  )

  if (phase === 'downloading') return wrap(
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⬇️</div>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>Downloading AI model…</h2>
      <p style={{ color: 'var(--muted)', fontSize: '.82rem', marginBottom: 24 }}>This happens once. The model stays on your device.</p>
      <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, marginBottom: 8, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.round(progress * 100)}%`, background: 'var(--accent)', borderRadius: 4, transition: 'width .4s' }} />
      </div>
      <p style={{ fontSize: '.82rem', color: 'var(--muted)', marginBottom: 20 }}>{Math.round(progress * 100)}% — {model.size}</p>
      <button className="btn btn-ghost btn-sm" onClick={() => { gemmaCancelDownload(); setPhase('prompt') }}>Cancel</button>
    </div>
  )

  if (phase === 'done') return wrap(
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--success)', marginBottom: 8 }}>AI ready!</h2>
      <p style={{ color: 'var(--muted)', fontSize: '.88rem', lineHeight: 1.6, marginBottom: 28 }}>
        Smart Paste will now use on-device AI to improve low-confidence matches automatically.
      </p>
      <button className="btn btn-primary btn-full" onClick={onDone}>Let's go →</button>
    </div>
  )

  return wrap(
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--danger)', marginBottom: 8 }}>Download failed</h2>
      <div style={{ background: 'rgba(224,82,82,.08)', border: '1px solid rgba(224,82,82,.25)', borderRadius: 8, padding: '10px 12px', marginBottom: 12, textAlign: 'left' }}>
        <p style={{ fontSize: '.75rem', color: '#f87171', fontFamily: 'monospace', wordBreak: 'break-all' }}>{errMsg}</p>
      </div>
      <button className="btn btn-primary btn-full" style={{ marginBottom: 10 }} onClick={() => setPhase('prompt')}>Try again</button>
      <button className="btn btn-ghost btn-full" onClick={onDone}>Skip for now</button>
    </div>
  )
}
