/**
 * Central registry for app-wide localStorage keys.
 *
 * Migrate keys here incrementally — adding a name first, then updating call
 * sites — rather than boil-the-ocean all `sip_*` keys at once.
 */

export const STORAGE_KEYS = Object.freeze({
  SIP_DRAFT_EDIT: 'sip_draft_edit',
  SIP_ONBOARDED: 'sip_onboarded',
  SIP_DRAFT_ORIGINAL: 'sip_draft_original',
  SIP_INVOICES: 'sip_invoices',
  SIP_CONTACTS: 'sip_contacts',
  SIP_AI_MODEL: 'sip_ai_model',
  SIP_ORDERS: 'sip_orders',
  SIP_ORDERS_SYNCED_AT: 'sip_orders_synced_at',
  SIP_PRODUCTS: 'sip_products',
  SIP_PRODUCTS_SYNCED_AT: 'sip_products_synced_at',
  SIP_PICKS: 'sip_picks',
  SIP_SETTINGS: 'sip_settings',
  SIP_FINETUNE_EXPORT_V1: 'sip_finetune_export_v1',
  SIP_CORRECTION_HISTORY_V1: 'sip_correction_history_v1',
})
