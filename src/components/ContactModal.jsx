import { ContactEditor } from './ContactEditor.jsx'

export function ContactModal({ contact, onSave, onClose }) {
  return <ContactEditor contact={contact} onSave={onSave} onClose={onClose} />
}
