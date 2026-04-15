# Phase 4 — Navigation: Burger Menu

**Effort:** ~1 day | **Priority:** High | **Depends on:** Phase 0

## Context
Inventory and Settings need to move off the bottom nav bar to make room for the Contacts tab (Phase 5). The bottom bar keeps: Dashboard, Invoices, Orders. A burger/hamburger menu slides in from the left for: Catalog, Settings, Contacts.

## Tasks

### 4a. Create `src/components/BurgerMenu.jsx`
Slide-in panel from left:

- `position: fixed; top: 0; left: 0; bottom: 0; width: 280px; z-index: 50`
- `transform: translateX(open ? '0' : '-100%')` with CSS transition `0.25s cubic-bezier(0.4,0,0.2,1)`
- Semi-opaque backdrop (`position: fixed; inset: 0; background: rgba(0,0,0,0.5)`) with `onClick` to close
- Menu items: **Catalog** (Inventory), **Settings**, **Contacts**
- Each item calls `onNavigate(tabId)` then `onClose()`
- Safe area padding: `env(safe-area-inset-top)` / `env(safe-area-inset-bottom)`
- Android back button: `document.addEventListener('backbutton', ...)` closes menu if open
- Escape key closes on web
- No animation library — pure CSS transform + React state

### 4b. Update App.jsx
**File:** `src/App.jsx`

- Add `const [menuOpen, setMenuOpen] = useState(false)` state
- Header: add hamburger button (`☰`) on left side of header bar
- Update `navItems` array (lines 385-392): remove `'inventory'` and `'settings'`
- Bottom nav becomes 3 items: Dashboard, Invoices, Orders
- Render `<BurgerMenu>` at root level:
  ```jsx
  <BurgerMenu
    open={menuOpen}
    onClose={() => setMenuOpen(false)}
    activeTab={tab}
    onNavigate={(t) => { setTab(t); setMenuOpen(false); setEditorOpen(false) }}
  />
  ```

### 4c. Add Icons to Icon.jsx
**File:** `src/components/Icon.jsx`

Add two new SVG paths:
- `menu` — three horizontal lines (hamburger icon)
- `contacts` — person silhouette with circle

### 4d. Add Styles to styles.js
**File:** `src/styles.js`

```css
.burger-overlay {
  position: fixed; inset: 0; z-index: 49;
  background: rgba(0,0,0,0.5);
  animation: fadeIn 0.2s ease-out;
}
.burger-panel {
  position: fixed; top: 0; left: 0; bottom: 0; width: 280px; z-index: 50;
  background: var(--card); transform: translateX(-100%);
  transition: transform 0.25s cubic-bezier(0.4,0,0.2,1);
  padding: env(safe-area-inset-top, 0) 0 env(safe-area-inset-bottom, 0);
}
.burger-panel.open { transform: translateX(0); }
```

## Files Created
- `src/components/BurgerMenu.jsx`

## Files Modified
- `src/App.jsx` — menuOpen state, header hamburger button, navItems reduced to 3
- `src/components/Icon.jsx` — menu + contacts icons
- `src/styles.js` — burger menu CSS

## Verification
- Bottom nav shows 3 tabs: Dashboard, Invoices, Orders
- Hamburger icon in header opens slide-in menu
- Menu items: Catalog, Settings, Contacts (Contacts shows empty state until Phase 5)
- Tapping backdrop or pressing Escape/Back closes menu
- Navigation works correctly from menu items
