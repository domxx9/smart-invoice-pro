// Central registry for all localStorage keys — governs storage access across the app.
// PR #122 introduced this file to enforce storage governance.
// When adding keys, always add here first, then update call sites.
// Do NOT change key string values — breaks existing persisted user data.

export const STORAGE_KEYS = {
  AI_MODEL: 'sip_ai_model',
  PRODUCTS: 'sip_products',
  PRODUCTS_SYNCED_AT: 'sip_products_synced_at',
  ORDERS: 'sip_orders',
  ORDERS_SYNCED_AT: 'sip_orders_synced_at',
  PICKS: 'sip_picks',
  DRAFT_EDIT: 'sip_draft_edit',
  DRAFT_ORIGINAL: 'sip_draft_original',
  INVOICES: 'sip_invoices',
  CONTACTS: 'sip_contacts',
}
