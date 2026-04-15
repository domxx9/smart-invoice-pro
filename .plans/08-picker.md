# Phase 8 — Picker

**Effort:** ~2-3 days | **Priority:** Medium | **Depends on:** Phase 6 (invoice lifecycle)

## Context
Unified picker UI shared between Orders (existing PickSheet) and invoice fulfillment. Two view modes: list (expandable rows) and card/carousel (swipe gestures). Partial picking support.

## Tasks

### 8a. Install react-swipeable
```bash
npm install react-swipeable
```
11KB, zero deps.

### 8b. Create `src/hooks/usePicker.js`
Shared state machine for picking:

```js
export function usePicker(items, persistKey) {
  const [picks, setPicks] = useState(() => {
    if (persistKey) {
      const s = localStorage.getItem(persistKey)
      return s ? JSON.parse(s) : {}
    }
    return {}
  })
  const [unavailable, setUnavailable] = useState({})

  const handlePick = (idx, qty) => {
    const clamped = Math.min(qty, items[idx]?.qty ?? 0)
    setPicks(prev => {
      const next = { ...prev, [idx]: clamped }
      if (persistKey) localStorage.setItem(persistKey, JSON.stringify(next))
      return next
    })
  }

  const handleUnavailable = (idx, bool) => {
    setUnavailable(prev => ({ ...prev, [idx]: bool }))
  }

  const totalQty = items.reduce((s, i) => s + (i.qty || 0), 0)
  const pickedQty = items.reduce((s, i, idx) => s + Math.min(picks[idx] ?? 0, i.qty || 0), 0)
  const allDone = totalQty > 0 && pickedQty === totalQty

  return { picks, unavailable, handlePick, handleUnavailable, totalQty, pickedQty, allDone }
}
```

Crash recovery via `persistKey` → localStorage.

### 8c. Create `src/components/PickerUI.jsx`
Unified render hub:
- Props: `items`, `picks`, `unavailable`, `onPick`, `onUnavailable`, `viewMode`, `onClose`
- Progress bar: `pickedQty / totalQty`
- View mode toggle button (saves preference to settings)
- Routes to `<PickerCard>` or `<PickerList>` based on `viewMode`

### 8d. Create `src/components/PickerCard.jsx`
Card/carousel view with swipe gestures:

```jsx
const handlers = useSwipeable({
  onSwipedRight: () => { onPick(idx, item.qty); advance() },
  onSwipedLeft:  () => { onUnavailable(idx, true); advance() },
  trackMouse: true,
})
```

- Full-screen card stack showing product image carousel
- CSS feedback: `rotate(4deg)` + green overlay on right-swipe, `rotate(-4deg)` + red overlay on left
- Haptic feedback via `@capacitor/haptics` → `Haptics.impact()` on confirm
- Auto-advance to next card after swipe

### 8e. Create `src/components/PickerList.jsx`
Expandable list view:
- Tap row header → expand/collapse via `max-height: 0 → max-height: 200px` CSS transition
- Expanded state: description, images (`loading="lazy"`), PickerQuantity stepper
- No animation library

### 8f. Create `src/components/PickerQuantity.jsx`
Stepper for partial picking:
- Shows "Ordered: X" label
- `−` / `+` buttons clamped to `[0, ordered qty]`
- Displays `picked/ordered` (e.g. `8/10`)

### 8g. Refactor `src/components/PickSheet.jsx`
Replace existing body with:
```jsx
const { picks, handlePick, handleUnavailable, ... } = usePicker(
  order.lineItems, `sip_picks_order_${order.id}`
)
return (
  <PickerUI
    items={order.lineItems}
    picks={picks}
    unavailable={{}}
    onPick={handlePick}
    onUnavailable={handleUnavailable}
    viewMode={settings?.pickerViewMode ?? 'list'}
    onClose={onClose}
  />
)
```

Orders tab works exactly as before, using new shared components.

### 8h. Invoice Fulfillment Flow
**File:** `src/components/InvoiceEditor.jsx` (from Phase 6d "Go to Picker" path)

When user selects "Go to Picker" in the fulfillment modal:
- Set `fulfillmentMethod: 'picker'` on invoice draft
- Open a full-screen `<PickerUI>` with the invoice's line items
- On completion → save with `status: 'fulfilled'` + picks data

Implementation: new state `invoicePickerOpen` in App.jsx. When set, render PickerUI as a full-screen overlay with invoice items. The `usePicker` hook manages picks, and on completion calls `handleSave` with fulfilled status.

### 8i. Settings — Picker View Mode
Add `pickerViewMode: 'list'` to settings defaults in App.jsx. PickerUI toggle saves preference via `onSave` settings callback.

## Files Created
- `src/hooks/usePicker.js`
- `src/components/PickerUI.jsx`
- `src/components/PickerCard.jsx`
- `src/components/PickerList.jsx`
- `src/components/PickerQuantity.jsx`

## Files Modified
- `src/components/PickSheet.jsx` — refactored to wrap PickerUI
- `src/components/InvoiceEditor.jsx` — "Go to Picker" opens PickerUI
- `src/App.jsx` — invoicePickerOpen state, pickerViewMode setting
- `src/components/Orders.jsx` — pass settings for viewMode

## Verification
- Orders tab → Start Pick → PickerUI opens in list view
- Toggle to card view → swipe right marks picked, swipe left marks unavailable
- Partial pick: ordered 10, pick 8 → shows `8/10`
- Invoice → Mark as Fulfilled → Go to Picker → PickerUI with invoice items
- Invoice → Mark as Fulfilled → Skip → immediately fulfilled
- Close and reopen pick → progress restored from localStorage
- Both order picker and invoice picker share same components (no duplication)
