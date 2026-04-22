import { useState } from 'react'

export function ContactSelector({ contacts, selectedIds, onChange, onOpenModal }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase()
    return (
      q === '' ||
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.business?.toLowerCase().includes(q)
    )
  })

  const selectedContacts = contacts.filter((c) => selectedIds.includes(c.id))

  const toggle = (id) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((sid) => sid !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  const remove = (id) => onChange(selectedIds.filter((sid) => sid !== id))

  return (
    <div className="contact-selector">
      <div className="contact-selector__chips">
        {selectedContacts.map((c) => (
          <span key={c.id} className="chip" onClick={() => onOpenModal(c)}>
            {c.name}
            <button
              type="button"
              className="chip__remove"
              onClick={() => remove(c.id)}
              aria-label={`Remove ${c.name}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div className="contact-selector__search-wrap">
        <input
          className="contact-selector__search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search contacts..."
        />
        {open && (
          <ul className="contact-selector__dropdown">
            <li
              className="contact-selector__option contact-selector__option--create"
              onMouseDown={() => {
                setSearch('')
                setOpen(false)
                onOpenModal(null)
              }}
            >
              + Create new contact
            </li>
            {filtered.map((c) => (
              <li
                key={c.id}
                className={`contact-selector__option ${selectedIds.includes(c.id) ? 'contact-selector__option--selected' : ''}`}
                onMouseDown={() => {
                  toggle(c.id)
                  setSearch('')
                  setOpen(false)
                }}
              >
                <span className="contact-selector__name">{c.name}</span>
                {c.business && <span className="contact-selector__biz">{c.business}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
