import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon.jsx'

const FIELDS = [
  { key: 'name', label: 'Name', required: true, autoComplete: 'name' },
  { key: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
  { key: 'phone', label: 'Phone', type: 'tel', autoComplete: 'tel' },
  { key: 'website', label: 'Website', type: 'url', autoComplete: 'url' },
]

function validate(values) {
  const errors = {}
  if (!values.name?.trim()) errors.name = 'Name is required.'
  if (values.email && !/^\S+@\S+\.\S+$/.test(values.email.trim()))
    errors.email = 'Enter a valid email.'
  return errors
}

export function QuickAddContactModal({ open, onClose, onAdd }) {
  const [values, setValues] = useState({ name: '', email: '', phone: '', website: '' })
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const nameRef = useRef(null)

  useEffect(() => {
    if (open) {
      setValues({ name: '', email: '', phone: '', website: '' })
      setTouched({})
      setSubmitted(false)
      // Focus after sheet slides in
      const t = setTimeout(() => nameRef.current?.focus(), 80)
      return () => clearTimeout(t)
    }
    return undefined
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const errors = validate(values)

  const handleSubmit = (e) => {
    e.preventDefault()
    setSubmitted(true)
    if (Object.keys(errors).length) return
    onAdd?.({ ...values, source: 'manual' })
    onClose?.()
  }

  return (
    <div
      className={`sheet-root ${open ? 'open' : ''}`}
      aria-hidden={open ? undefined : 'true'}
      role="presentation"
    >
      <button
        type="button"
        className="sheet-backdrop"
        aria-label="Close quick add"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <form
        className="sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Quick add contact"
        onSubmit={handleSubmit}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="flex-between" style={{ marginBottom: 8 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Quick add contact</h3>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        {FIELDS.map((f) => {
          const showError = (submitted || touched[f.key]) && errors[f.key]
          return (
            <div key={f.key} className="field">
              <label>
                {f.label}
                {f.required ? (
                  <span aria-hidden="true" style={{ color: 'var(--danger)' }}>
                    {' '}
                    *
                  </span>
                ) : null}
                <input
                  ref={f.key === 'name' ? nameRef : undefined}
                  type={f.type || 'text'}
                  autoComplete={f.autoComplete}
                  value={values[f.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  onBlur={() => setTouched((t) => ({ ...t, [f.key]: true }))}
                  aria-invalid={showError ? 'true' : undefined}
                  aria-describedby={showError ? `quick-${f.key}-error` : undefined}
                />
              </label>
              {showError ? (
                <p
                  id={`quick-${f.key}-error`}
                  style={{ color: 'var(--danger)', fontSize: '.72rem', marginTop: 4 }}
                >
                  {errors[f.key]}
                </p>
              ) : null}
            </div>
          )
        })}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={!!Object.keys(errors).length}
          >
            Add
          </button>
        </div>
      </form>
    </div>
  )
}
