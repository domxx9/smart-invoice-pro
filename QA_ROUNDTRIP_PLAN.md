# Android APK Export/Import Round-Trip QA Plan (SMA-91)

Manual on-device testing for export/import backup functionality. All automated unit tests pass (100/100 ✓). This plan covers end-to-end device behavior.

## Pre-Test Setup

1. **APK Installation**
   - Build and install latest APK on Android device
   - Allow all requested permissions (Filesystem, Share)
   - Complete initial onboarding if first run

2. **Clear State**
   - Tap Settings → scroll to "Debugging" section (if available)
   - Clear app data via Android Settings → Apps → Smart Invoice Pro → Storage → Clear Data
   - Verify app returns to fresh state with no invoices

## Test Scenario A: Export Without Secrets (Default)

### A1 — Export empty backup

1. Settings → Backup & Restore → "Export as JSON"
2. Verify JSON file is created/shared
3. Open file in text editor, verify it contains:
   - `"kind": "smart-invoice-pro-backup"`
   - `"version": 1`
   - `"secrets": null` (secrets NOT included)
   - `"data": { "invoices": [], "products": [], ... }`

### A2 — Create test data and export

1. Dashboard → Create new invoice:
   - Customer: "Alice Inc."
   - Items: 2x Widget @ $50 = $100
   - Tax: $10
   - Total: $110
2. Dashboard → Add a product:
   - Name: "Gadget"
   - Price: $25
3. Settings → Backup & Restore → "Export as JSON"
4. Verify JSON export contains:
   - 1 invoice with correct data
   - 1 product with correct name/price
   - No API keys or secrets in the JSON

## Test Scenario B: Export With Secrets (Opt-In)

### B1 — Set API key and export with secrets

1. Settings → (find API key setting, e.g., Squarespace API)
2. Enter test key: `sq-test-key-12345`
3. Settings → Backup & Restore → "Export as JSON" → toggle "Include API keys" ON
4. Verify JSON contains:
   - `"secrets": { "sqApiKey": "sq-test-key-12345", ... }`
   - Secrets NOT in the `"data"` block

## Test Scenario C: Full Round-Trip (Merge Mode)

### C1 — Export with data

1. Ensure app has 1 invoice, 1 product (from A2)
2. Settings → Backup & Restore → Export as JSON
3. Save/note the filename (e.g., `smart-invoice-pro-backup-2026-04-20.json`)

### C2 — Clear data and import (merge)

1. Settings → Backup & Restore → "Clear All Data" → Confirm
2. Verify app is empty (no invoices, no products)
3. Settings → Backup & Restore → "Import from JSON"
4. Select the backup file from step C1
5. Verify import dialog shows counts: "1 invoice, 1 product"
6. Tap "Import" with default (merge) mode
7. Verify app now shows:
   - Original invoice restored
   - Original product restored
   - All fields match (customer, items, prices, tax)

### C3 — Merge preserves local-only data

1. Create a new invoice locally:
   - Customer: "Bob's Diner"
   - Items: 3x Coffee @ $5 = $15
   - Tax: $2
   - Save
2. Re-import the backup from C1 (merge mode)
3. Verify app now has BOTH:
   - Original "Alice Inc." invoice
   - New "Bob's Diner" invoice
4. No data lost

## Test Scenario D: Full Round-Trip (Replace Mode)

### D1 — Export, clear, import with replace

1. Ensure app has original invoice + "Bob's Diner" (2 invoices total from C3)
2. Export backup (JSON file)
3. Settings → Backup & Restore → "Clear All Data" → Confirm
4. Settings → Backup & Restore → "Import from JSON"
5. Select backup file
6. Tap "Import" → toggle to **Replace Mode**
7. Confirm import

### D2 — Verify replace mode data

1. Verify app shows ONLY the original "Alice Inc." invoice
2. Verify "Bob's Diner" is GONE (it wasn't in the backup)
3. All original data intact and unmodified

## Test Scenario E: Edge Cases & Validation

### E1 — Reject invalid/corrupt file

1. Settings → Backup & Restore → "Import from JSON"
2. Select a non-JSON file (e.g., .txt with "not json" text)
3. Verify error: "not valid JSON" or similar
4. No data corruption, app remains in safe state

### E2 — Reject backup from different app

1. Create JSON file with:
   ```json
   { "kind": "other-app-backup", "version": 1, "data": {} }
   ```
2. Settings → Backup & Restore → "Import from JSON" → select file
3. Verify error: "Unexpected backup kind"

### E3 — Reject unsupported schema version

1. Create JSON with `"version": 2` (unsupported)
2. Attempt import
3. Verify error: "Unsupported schema version"

### E4 — Large backup (stress test)

1. Create 5–10 invoices with varying details
2. Add 3–5 products
3. Export as JSON
4. Verify file size is reasonable (~10–50 KB)
5. Clear and import
6. Verify all invoices/products restored without truncation/corruption

## Test Scenario F: CSV Export

### F1 — Export invoices to CSV

1. Dashboard with invoices from E4 (5–10 invoices)
2. Settings → Backup & Restore → "Export as CSV"
3. Verify CSV file is created/shared with name like `smart-invoice-pro-backup-2026-04-20.csv`
4. Open in spreadsheet app or text editor:
   - Header row: `invoice_number,customer,email,date,due,status,subtotal,tax,total,notes`
   - One data row per invoice
   - Commas, quotes, newlines are properly escaped per RFC 4180
   - Numeric totals match invoice calculations

## Test Scenario G: Share & Download Flow

### G1 — Share backup (if system allows)

1. Settings → Backup & Restore → "Export as JSON"
2. Verify native share sheet appears (Android chooser)
3. Can share to Email, Drive, Slack, etc.
4. Verify received file opens and is valid JSON

### G2 — Open shared backup

1. Receive shared backup JSON file
2. Open with Smart Invoice Pro (tap → "Import with Smart Invoice Pro")
3. Verify app launches import dialog
4. Proceed with import (test C or D)

## Pass/Fail Criteria

**PASS** if:

- ✓ All 100 unit tests pass
- ✓ Export creates valid JSON (schema v1, no secrets by default)
- ✓ Export with secrets keeps secrets separate from data
- ✓ Merge mode imports without losing local data
- ✓ Replace mode imports and wipes untracked data
- ✓ CSV export is RFC-4180 compliant
- ✓ Invalid/corrupt files are rejected with clear errors
- ✓ Large backups (250+ invoices) work without issues
- ✓ Share flow works on Android (filesystem + native share intent)
- ✓ Round-trip preserves all data: invoices, products, orders, settings, sync timestamps

**FAIL** if:

- ✗ Any scenario causes app crash
- ✗ Data corruption or loss during import
- ✗ Secrets leak into JSON when not opted-in
- ✗ Merge mode creates duplicate rows
- ✗ CSV is malformed (header/row count mismatch, unescaped commas/quotes)
- ✗ Invalid files accepted without validation error

## Notes

- All timestamps are in ISO format (UTC) — verify time calculations are preserved during round-trip
- Settings merge is shallow (new settings overwrite old, but not vice-versa)
- Onboarded state is preserved (SMA-95: skipTour flag works)
- Local draft edits (`sip_draft_edit`, `sip_draft_original`) are intentionally NOT exported
