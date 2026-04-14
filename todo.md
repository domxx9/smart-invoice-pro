# TODO

- [ ] Review AI pipeline — update context strategy based on mode:
  - **On-device (onboard) AI:** low context window — AI selects from a presented set of options (pre-filtered choices, not full data)
  - **API key (cloud AI):** full context — send entire product list, full input text, and system prompt
- [ ] Polish regex parser and onboard AI behavior

## Onboard AI — Critical Fixes
- [ ] **Model loading freeze:** app freezes when model loads into RAM on startup — move model loading to a background thread so the UI remains responsive
- [ ] **Processing freeze:** app freezes while AI is processing — run inference on a background thread; UI must stay interactive during this time
- [ ] **Background AI behaviour:** AI results should arrive asynchronously — user should be able to immediately interact with flagged (red) items while AI works in the background; apply AI results when ready without blocking the user
- [ ] Create burger menu to replace Inventory & Settings (these are now accessed via burger menu only)
  - Burger menu includes: Inventory, Settings, Contacts tab
- [ ] Dashboard: add "Quick Add Contact" — supports name, email / phone number / website

## Contacts
- [ ] Contacts tab accessible via burger menu
- [ ] Add, edit, and delete contacts
- [ ] Settings page: Contacts section
  - Import from Squarespace
  - Import from mobile contacts
  - (more import sources TBD)

## Invoices
- [ ] Invoice importing and storing
