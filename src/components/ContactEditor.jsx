import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon.jsx'

const FIELDS = [
  { key: 'name', label: 'Name', required: true, autoComplete: 'name' },
  { key: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
  { key: 'phone', label: 'Phone', type: 'tel', autoComplete: 'tel' },
  { key: 'website', label: 'Website', type: 'url', autoComplete: 'url' },
  { key: 'businessName', label: 'Business name', autoComplete: 'organization' },
  { key: 'address1', label: 'Address line 1', autoComplete: 'address-line1' },
  { key: 'address2', label: 'Address line 2', autoComplete: 'address-line2' },
  { key: 'city', label: 'City', autoComplete: 'address-level2' },
  { key: 'postcode', label: 'Postcode', autoComplete: 'postal-code' },
  { key: 'country', label: 'Country', autoComplete: 'country-name' },
]

const EMPTY = FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: '' }), { source: 'manual' })

function validate(values) {
  const errors = {}
  if (!values.name?.trim()) errors.name = 'Name is required.'
  if (values.email && !/^\S+@\S+\.\S+$/.test(values.email.trim()))
    errors.email = 'Enter a valid email.'
  return errors
}

export function ContactEditor({ contact, onSave, onDelete, onClose }) {
  const initial = useMemo(() => ({ ...EMPTY, ...(contact || {}) }), [contact])
  const [values, setValues] = useState(initial)
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const firstFieldRef = useRef(null)

  useEffect(() => {
    setValues(initial)
    setTouched({})
    setSubmitted(false)
  }, [initial])

  useEffect(() => {
    firstFieldRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const errors = validate(values)
  const isNew = !contact?.id

  const handleSubmit = (e) => {
    e.preventDefault()
    setSubmitted(true)
    if (Object.keys(errors).length) return
    onSave?.(values)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isNew ? 'Add contact' : 'Edit contact'}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 48,
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="card"
        style={{
          maxWidth: 480,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: 0,
        }}
      >
        <div
          className="flex-between"
          style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}
        >
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>
            {isNew ? 'Add contact' : 'Edit contact'}
          </h3>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>

        <div style={{ padding: 16 }}>
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
                    ref={f.key === 'name' ? firstFieldRef : undefined}
                    type={f.type || 'text'}
                    autoComplete={f.autoComplete}
                    value={values[f.key] || ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    onBlur={() => setTouched((t) => ({ ...t, [f.key]: true }))}
                    aria-invalid={showError ? 'true' : undefined}
                    aria-describedby={showError ? `contact-${f.key}-error` : undefined}
                  />
                </label>
                {showError ? (
                  <p
                    id={`contact-${f.key}-error`}
                    style={{ color: 'var(--danger)', fontSize: '.72rem', marginTop: 4 }}
                  >
                    {errors[f.key]}
                  </p>
                ) : null}
              </div>
            )
          })}

          {contact?.source && contact.source !== 'manual' ? (
            <p
              className="text-muted"
              style={{ fontSize: '.72rem', marginTop: 4 }}
            >
              Imported from {contact.source}.
            </p>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderTop: '1px solid var(--border)',
          }}
        >
          {!isNew ? (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => {
                if (window.confirm('Delete this contact?')) onDelete?.(contact.id)
              }}
            >
              <Icon name="trash" /> Delete
            </button>
          ) : (
            <span />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={!!Object.keys(errors).length}
            >
              {isNew ? 'Add' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
