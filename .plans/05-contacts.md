# Phase 5 — Contacts CRUD

**Effort:** ~2 days | **Priority:** High | **Depends on:** Phase 4 (burger menu for navigation)

## Context
Contacts tab accessible via burger menu. Add/edit/delete contacts. Import from Squarespace customers and phone contacts. Quick Add from Dashboard.

## Data Model
Storage: `localStorage` key `sip_contacts`

```js
{
  id: 'contact_<timestamp>_<random>',
  name: '',           // required
  email: '',
  phone: '',
  website: '',
  businessName: '',
  address1: '', address2: '', city: '', postcode: '', country: '',
  source: 'manual',   // 'manual' | 'phone' | 'squarespace'
  createdAt: ISO string,
}
```

## Tasks

### 5a. Create `src/hooks/useContacts.js`
Custom hook managing contacts state + localStorage persistence:
- `contacts` — state array
- `addContact(contactData)` — generates ID, sets createdAt, saves
- `updateContact(id, updates)` — merges updates, saves
- `deleteContact(id)` — filters out, saves

Hook lives in App.jsx so contacts can be passed to InvoiceEditor (future: customer autocomplete).

### 5b. Create `src/api/contacts.js`
Two import functions:

**`importPhoneContacts()`:**
- Uses `@capacitor-community/contacts` plugin
- On web: show friendly toast "Phone contacts available on mobile only"
- Maps phone contact fields to the contact data model
- Sets `source: 'phone'`

**`fetchSquarespaceCustomers(apiKey, onProgress)`:**
- Reuses pagination pattern from `src/api/squarespace.js`
- Extracts unique customers from order billing addresses
- Deduplicates by email
- Sets `source: 'squarespace'`

### 5c. Create `src/components/Contacts.jsx`
Main list view:
- Search bar — `useMemo` filter on name/email/phone/businessName
- Sorted alphabetically by name
- Tap row → open ContactEditor modal (prefilled)
- Import buttons at top: "From Phone", "From Squarespace" (with progress)
- Empty state with instruction text
- Renders via burger menu navigation (`tab === 'contacts'`)

### 5d. Create `src/components/ContactEditor.jsx`
Full-screen modal for add/edit:
- All data model fields
- Name required — inline validation
- Email format check (optional field, but validate if provided)
- Save and Delete buttons
- `position: fixed; inset: 0; z-index: 40`

### 5e. Create `src/components/QuickAddContactModal.jsx`
Bottom sheet for Dashboard quick-add:
- Minimal fields: Name (required), Email, Phone, Website
- Slide-up from bottom: `transform: translateY(open ? '0' : '100%')`
- Auto-focus name field via `useEffect` + `inputRef.current.focus()`
- On submit → calls `addContact` from useContacts hook

### 5f. Update Dashboard.jsx
**File:** `src/components/Dashboard.jsx`

Add "+" icon button next to "New Invoice" button. On click → `onQuickAddContact()` prop lifts up to App.jsx to open QuickAddContactModal.

### 5g. Update Settings.jsx
**File:** `src/components/Settings.jsx`

Add "Contacts" section with two buttons:
- "Import from Phone" → calls `importPhoneContacts()`
- "Import from Squarespace" → calls `fetchSquarespaceCustomers(settings.sqApiKey)`

### 5h. Update App.jsx
- Integrate `useContacts` hook
- Add `contacts` tab rendering: `{tab === 'contacts' && <Contacts ... />}`
- Add QuickAddContactModal state + rendering
- Pass contacts to relevant components

### 5i. Native Permissions (documentation, applied during cap sync)
- iOS: `NSContactsUsageDescription` in `ios/App/App/Info.plist`
- Android: `READ_CONTACTS` in `android/app/src/main/AndroidManifest.xml`
- Install: `npm install @capacitor-community/contacts && npx cap sync`

## Files Created
- `src/hooks/useContacts.js`
- `src/api/contacts.js`
- `src/components/Contacts.jsx`
- `src/components/ContactEditor.jsx`
- `src/components/QuickAddContactModal.jsx`

## Files Modified
- `src/App.jsx` — useContacts hook, contacts tab, QuickAddContactModal
- `src/components/Dashboard.jsx` — Quick Add button
- `src/components/Settings.jsx` — Contacts import section

## Verification
- Burger menu → Contacts → empty state shown
- Add contact via editor → appears in list
- Edit contact → changes persist after refresh
- Delete contact → removed from list
- Dashboard "+" button → QuickAddContactModal slides up
- Search filters contacts by name/email
