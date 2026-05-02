/**
 * Central registry for app-wide localStorage keys.
 *
 * Migrate keys here incrementally — adding a name first, then updating call
 * sites — rather than boil-the-ocean all `sip_*` keys at once.
 */

export const STORAGE_KEYS = Object.freeze({
  SIP_DRAFT_EDIT: 'sip_draft_edit',
  SIP_ONBOARDED: 'sip_onboarded',
})
