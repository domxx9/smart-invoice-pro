import { useState } from 'react'

const EMPTY = {
  name: '',
  business: '',
  email: '',
  phone: '',
  address1: '',
  address2: '',
  city: '',
  postcode: '',
  country: '',
}

export function ContactModal({ contact, onSave, onClose }) {
  const [form, setForm] = useState(contact ? { ...contact } : { ...EMPTY })
  const [errors, setErrors] = useState({})

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const validate = () => {
    const e = {}
    if (!form.name?.trim()) e.name = 'Name is required'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = 'Invalid email address'
    return e
  }

  const handleSave = () => {
    const e = validate()
    if (Object.keys(e).length) {
      setErrors(e)
      return
    }
    onSave({ ...form, name: form.name.trim() })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h3>{contact ? 'Edit Contact' : 'New Contact'}</h3>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal__body">
          <div className="field">
            <label>
              Name *
              <input value={form.name} onChange={(e) => set('name', e.target.value)} />
              {errors.name && <span className="field__error">{errors.name}</span>}
            </label>
          </div>
          <div className="field">
            <label>
              Business
              <input value={form.business} onChange={(e) => set('business', e.target.value)} />
            </label>
          </div>
          <div className="field">
            <label>
              Email
              <input
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                type="email"
              />
              {errors.email && <span className="field__error">{errors.email}</span>}
            </label>
          </div>
          <div className="field">
            <label>
              Phone
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </label>
          </div>
          <div className="field">
            <label>
              Address Line 1
              <input value={form.address1} onChange={(e) => set('address1', e.target.value)} />
            </label>
          </div>
          <div className="field">
            <label>
              Address Line 2
              <input value={form.address2} onChange={(e) => set('address2', e.target.value)} />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="field">
              <label>
                City
                <input value={form.city} onChange={(e) => set('city', e.target.value)} />
              </label>
            </div>
            <div className="field">
              <label>
                Postcode
                <input value={form.postcode} onChange={(e) => set('postcode', e.target.value)} />
              </label>
            </div>
          </div>
          <div className="field">
            <label>
              Country
              <input value={form.country} onChange={(e) => set('country', e.target.value)} />
            </label>
          </div>
        </div>
        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
