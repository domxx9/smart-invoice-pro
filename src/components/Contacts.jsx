import { useMemo, useState } from 'react'
import { Icon } from './Icon.jsx'
import { ContactEditor } from './ContactEditor.jsx'

function searchMatches(contact, query) {
  if (!query) return true
  const hay = [
    contact.name,
    contact.email,
    contact.phone,
    contact.businessName,
    contact.city,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return hay.includes(query.toLowerCase())
}

export function Contacts({ contacts, addContact, updateContact, deleteContact }) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim()
    const list = contacts.filter((c) => searchMatches(c, q))
    return list.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [contacts, query])

  const handleSave = (values) => {
    if (editing?.id) {
      updateContact(editing.id, values)
    } else {
      addContact(values)
    }
    setEditing(null)
    setCreating(false)
  }

  const handleDelete = (id) => {
    deleteContact(id)
    setEditing(null)
  }

  return (
    <div>
      <div className="flex-between mb-16">
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Contacts</h2>
          <p className="text-muted">
            {contacts.length} saved
            {query ? ` · ${filtered.length} matching` : ''}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Icon name="plus" /> Add
        </button>
      </div>

      <div className="contacts-header">
        <div className="field contacts-search" style={{ margin: 0 }}>
          <label className="sr-only" htmlFor="contacts-search">
            Search contacts
          </label>
          <input
            id="contacts-search"
            type="search"
            placeholder="Search name, email, phone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <p className="text-muted" style={{ fontSize: '.82rem' }}>
            {contacts.length === 0
              ? 'No contacts yet. Tap Add or import from Settings.'
              : 'No contacts match your search.'}
          </p>
        </div>
      ) : (
        <ul className="contacts-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="contact-row"
                onClick={() => setEditing(c)}
                aria-label={`Edit ${c.name || 'contact'}`}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="name">{c.name || '—'}</div>
                  <div
                    className="meta"
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.email || c.phone || c.businessName || '—'}
                  </div>
                </div>
                <span className={`contact-source ${c.source || 'manual'}`}>
                  {c.source || 'manual'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <ContactEditor
          contact={null}
          onSave={handleSave}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {editing ? (
        <ContactEditor
          contact={editing}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  )
}
