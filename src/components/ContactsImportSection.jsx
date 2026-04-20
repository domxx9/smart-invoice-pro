import { useState } from 'react'
import { SettingsSection } from './SettingsSection.jsx'
import { fetchSquarespaceCustomers, importPhoneContacts } from '../api/contacts.js'

function statusLabel(status, count) {
  if (status === 'syncing') return count ? `Importing… ${count}` : 'Importing…'
  if (status === 'ok') return '✓ Imported'
  if (status === 'error') return '✗ Failed'
  return null
}

export function ContactsImportSection({ contactsApi, sqApiKey, onToast }) {
  const [sqStatus, setSqStatus] = useState('idle')
  const [sqCount, setSqCount] = useState(0)
  const [sqError, setSqError] = useState('')
  const [phoneStatus, setPhoneStatus] = useState('idle')
  const [phoneError, setPhoneError] = useState('')

  const runSquarespace = async () => {
    if (!sqApiKey) {
      setSqError('Add a Squarespace API key in Integrations first.')
      setSqStatus('error')
      return
    }
    setSqStatus('syncing')
    setSqCount(0)
    setSqError('')
    try {
      const fetched = await fetchSquarespaceCustomers(sqApiKey, setSqCount)
      const { added, skipped } = contactsApi.mergeContacts(fetched)
      setSqStatus('ok')
      onToast?.(
        `Squarespace import: +${added} new${skipped ? `, ${skipped} duplicates skipped` : ''}`,
        'success',
        '✓',
      )
    } catch (err) {
      setSqStatus('error')
      setSqError(err?.message || 'Import failed')
      onToast?.(`Squarespace import failed: ${err?.message || 'unknown error'}`, 'error')
    }
  }

  const runPhone = async () => {
    setPhoneStatus('syncing')
    setPhoneError('')
    try {
      const fetched = await importPhoneContacts()
      const { added, skipped } = contactsApi.mergeContacts(fetched)
      setPhoneStatus('ok')
      onToast?.(
        `Phone import: +${added} new${skipped ? `, ${skipped} duplicates skipped` : ''}`,
        'success',
        '✓',
      )
    } catch (err) {
      setPhoneStatus('error')
      setPhoneError(err?.message || 'Import failed')
      onToast?.(`Phone import failed: ${err?.message || 'unknown error'}`, 'error')
    }
  }

  const sqLabel = statusLabel(sqStatus, sqCount)
  const phoneLabel = statusLabel(phoneStatus)

  return (
    <SettingsSection title="Contacts">
      <p className="text-muted" style={{ fontSize: '.78rem', marginBottom: 10 }}>
        {contactsApi.contacts.length} contact{contactsApi.contacts.length === 1 ? '' : 's'} saved.
        Imports merge by email, phone, or name (no duplicates).
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={runSquarespace}
          disabled={sqStatus === 'syncing' || !sqApiKey}
        >
          {sqLabel || 'Import from Squarespace'}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={runPhone}
          disabled={phoneStatus === 'syncing'}
        >
          {phoneLabel || 'Import from phone'}
        </button>
      </div>
      {sqError ? (
        <p style={{ color: 'var(--danger)', fontSize: '.75rem', marginTop: 8 }}>{sqError}</p>
      ) : null}
      {phoneError ? (
        <p style={{ color: 'var(--danger)', fontSize: '.75rem', marginTop: 8 }}>{phoneError}</p>
      ) : null}
    </SettingsSection>
  )
}
