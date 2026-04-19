// Preset option lists for the Smart Paste AI Context dropdowns (SMA-97).
// Each value is a short phrase the AI prompt can consume directly — the
// label the user sees IS the string stored in settings, so no label/value
// translation is needed at the prompt boundary.

export const SHOP_TYPE_OPTIONS = [
  'Brick-and-mortar retail',
  'Online store / e-commerce',
  'Trade counter / wholesale',
  'Market stall / pop-up',
  'Mobile / field service',
  'Mixed online + in-person',
  'B2B direct sales',
]

export const CUSTOMER_TYPE_OPTIONS = [
  'Walk-in retail consumers',
  'Trade / B2B contractors',
  'Restaurants & hospitality',
  'Small retailers / resellers',
  'Repeat regulars / members',
  'Wholesale buyers',
  'Mix of retail and trade',
]

// Vocabulary is allowed to be blank — the blank option is surfaced as the
// first choice in the UI rather than listed here.
export const VOCABULARY_OPTIONS = [
  'Standard English — no trade slang',
  'Trade abbreviations and part codes',
  'Brand nicknames and short forms',
  'Mixed abbreviations and typos',
  'Industry-specific jargon',
]

export const LOCALE_OPTIONS = [
  'English (UK)',
  'English (US)',
  'English (AU/NZ)',
  'English (Canada)',
  'Spanish',
  'French',
  'German',
  'Italian',
  'Portuguese',
  'Dutch',
  'Mixed English + Spanish',
  'Mixed English + French',
  'Multilingual / codeswitching',
]
