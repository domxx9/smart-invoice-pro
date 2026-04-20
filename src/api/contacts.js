import { logger } from '../utils/logger.js'

const CONTACT_PROJECTION = {
  name: true,
  organization: true,
  phones: true,
  emails: true,
  postalAddresses: true,
  urls: true,
}

function joinName(name) {
  if (!name) return ''
  if (name.display) return name.display.trim()
  return [name.given, name.middle, name.family].filter(Boolean).join(' ').trim()
}

function primary(list) {
  if (!Array.isArray(list) || !list.length) return null
  return list.find((x) => x?.isPrimary) || list[0]
}

function mapPhoneContact(payload) {
  const phone = primary(payload.phones)
  const email = primary(payload.emails)
  const addr = primary(payload.postalAddresses)
  const url = Array.isArray(payload.urls) ? payload.urls.find(Boolean) : null
  return {
    name: joinName(payload.name) || payload.organization?.company || '',
    email: (email?.address || '').trim(),
    phone: (phone?.number || '').trim(),
    website: (url || '').trim(),
    businessName: (payload.organization?.company || '').trim(),
    address1: (addr?.street || '').trim(),
    city: (addr?.city || '').trim(),
    postcode: (addr?.postcode || '').trim(),
    country: (addr?.country || '').trim(),
    source: 'phone',
  }
}

async function loadContactsPlugin() {
  const winCap = typeof window !== 'undefined' ? window.Capacitor : null
  const plugin = winCap?.Plugins?.Contacts
  if (plugin) return plugin
  try {
    const mod = await import('@capacitor-community/contacts')
    return mod.Contacts
  } catch (err) {
    logger.warn('contacts', `plugin import failed: ${err?.message ?? err}`)
    throw new Error('Contacts plugin unavailable on this platform.')
  }
}

export async function importPhoneContacts() {
  const Contacts = await loadContactsPlugin()
  const permission = await Contacts.requestPermissions()
  if (permission.contacts !== 'granted' && permission.contacts !== 'limited') {
    throw new Error('Contacts permission denied.')
  }
  const result = await Contacts.getContacts({ projection: CONTACT_PROJECTION })
  const payloads = result?.contacts || []
  logger.info('contacts', `phone import returned ${payloads.length} entries`)
  return payloads.map(mapPhoneContact).filter((c) => c.name || c.email || c.phone)
}

function mapSquarespaceProfile(profile) {
  const billing = profile.billingAddress || profile.address || {}
  const fullName =
    [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() ||
    [billing.firstName, billing.lastName].filter(Boolean).join(' ').trim() ||
    profile.email ||
    ''
  return {
    name: fullName,
    email: (profile.email || '').trim(),
    phone: (billing.phone || profile.phone || '').trim(),
    website: '',
    businessName: '',
    address1: (billing.address1 || '').trim(),
    address2: (billing.address2 || '').trim(),
    city: (billing.city || '').trim(),
    postcode: (billing.postalCode || '').trim(),
    country: (billing.countryCode || '').trim(),
    source: 'squarespace',
  }
}

export async function fetchSquarespaceCustomers(apiKey, onProgress) {
  if (!apiKey) throw new Error('Squarespace API key required to import customers.')
  const winCap = typeof window !== 'undefined' ? window.Capacitor : null
  const isNative = winCap?.isNativePlatform?.()
  const all = []
  let cursor = null

  do {
    const qs = cursor ? `?cursor=${cursor}` : ''
    const url = `https://api.squarespace.com/1.0/commerce/profiles${qs}`
    const devUrl = `/api/sqsp/1.0/commerce/profiles${qs}`
    let data

    if (isNative) {
      const res = await winCap.Plugins.CapacitorHttp.get({
        url,
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (res.status < 200 || res.status >= 300)
        throw new Error(`Squarespace Profiles API ${res.status} — ${JSON.stringify(res.data)}`)
      data = res.data
    } else {
      const res = await fetch(devUrl, { headers: { Authorization: `Bearer ${apiKey}` } })
      if (!res.ok) throw new Error(`Squarespace Profiles API ${res.status}: ${res.statusText}`)
      data = await res.json()
    }

    const batch = data.profiles ?? data.result ?? []
    if (!Array.isArray(batch))
      throw new Error(`Unexpected profiles response: ${JSON.stringify(data).slice(0, 200)}`)

    all.push(...batch.map(mapSquarespaceProfile))
    onProgress?.(all.length)
    cursor = data.pagination?.nextPageCursor ?? null
  } while (cursor)

  logger.info('contacts', `squarespace customers imported: ${all.length}`)
  return all.filter((c) => c.name || c.email)
}
