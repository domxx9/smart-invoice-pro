/**
 * Correction persistence layer.
 * Uses localStorage (web/native via Capacitor Preferences fallback).
 * Storage key: sip_correction_history_v1
 */

const STORAGE_KEY = 'sip_correction_history_v1'

export function normalizeText(s) {
  if (s == null) return ''
  return String(s).toLowerCase().replace(/\s+/g, ' ').trim()
}

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

export function saveCorrection({ originalText, correctedProductId, correctedProductName }) {
  if (!originalText || !correctedProductId) return
  const normalizedText = normalizeText(originalText)
  const timestamp = new Date().toISOString()
  const entries = loadEntries()
  const existingIdx = entries.findIndex(
    (e) => e.normalizedText === normalizedText && e.correctedProductId === correctedProductId,
  )
  if (existingIdx !== -1) {
    entries[existingIdx].count += 1
    entries[existingIdx].timestamp = timestamp
  } else {
    entries.push({
      originalText,
      normalizedText,
      correctedProductId,
      correctedProductName,
      timestamp,
      count: 1,
    })
  }
  saveEntries(entries)
}

export function getCorrections() {
  return loadEntries()
}

export function getCorrectionMap() {
  const entries = loadEntries()
  const map = new Map()
  const sorted = [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  for (const entry of sorted) {
    if (!map.has(entry.normalizedText)) {
      map.set(entry.normalizedText, {
        productId: entry.correctedProductId,
        productName: entry.correctedProductName,
        count: entry.count,
      })
    }
  }
  return map
}

export function clearCorrections() {
  localStorage.removeItem(STORAGE_KEY)
}

export function getStats() {
  const entries = loadEntries()
  const totalCorrections = entries.reduce((sum, e) => sum + e.count, 0)
  const uniqueMappings = new Set(entries.map((e) => `${e.normalizedText}|${e.correctedProductId}`))
    .size
  const lastCorrectionAt = entries.length
    ? entries.reduce((latest, e) => (e.timestamp > latest ? e.timestamp : latest), '')
    : null
  return { totalCorrections, uniqueMappings, lastCorrectionAt }
}
