import { useState } from 'react'
import { Icon } from './Icon'

const ContactSelector = ({ contacts, selectedIds, onChange, onOpenModal }) => {
  const [searchTerm, setSearchTerm] = useState('')

  const selectedContacts = selectedIds
    .map((id) => contacts.find((c) => c.id === id))
    .filter(Boolean)
  const unselectedContacts = contacts.filter((c) => !selectedIds.includes(c.id))
  const filteredContacts = unselectedContacts.filter(
    (contact) =>
      contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (contact.business && contact.business.toLowerCase().includes(searchTerm.toLowerCase())),
  )

  const handleSelect = (id) => {
    onChange([...selectedIds, id])
    setSearchTerm('')
  }

  const handleRemove = (id) => {
    onChange(selectedIds.filter((selectedId) => selectedId !== id))
  }

  return (
    <div className="contact-selector">
      <div className="chips">
        {selectedContacts.map((contact) => (
          <div key={contact.id} className="chip">
            <span>{contact.name}</span>
            <button onClick={() => handleRemove(contact.id)} aria-label={`Remove ${contact.name}`}>
              <Icon name="close" />
            </button>
          </div>
        ))}
      </div>
      <div className="search-container">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search contacts..."
          aria-label="Search contacts"
        />
        {searchTerm && (
          <ul className="dropdown" role="listbox">
            <li
              role="option"
              aria-selected="false"
              onClick={() => onOpenModal(undefined)}
              onKeyDown={(e) => e.key === 'Enter' && onOpenModal(undefined)}
            >
              <Icon name="plus" />+ Create new contact
            </li>
            {filteredContacts.map((contact) => (
              <li
                key={contact.id}
                role="option"
                aria-selected="false"
                onClick={() => handleSelect(contact.id)}
                onKeyDown={(e) => e.key === 'Enter' && handleSelect(contact.id)}
              >
                {contact.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export { ContactSelector }
export default ContactSelector
