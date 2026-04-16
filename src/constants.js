export const CURRENCY_TAX = {
  GBP: { label: 'GBP — British Pound (£)', tax: 20 },
  USD: { label: 'USD — US Dollar ($)', tax: 0 },
  EUR: { label: 'EUR — Euro (€)', tax: 20 },
  AUD: { label: 'AUD — Australian Dollar (A$)', tax: 10 },
  CAD: { label: 'CAD — Canadian Dollar (C$)', tax: 5 },
  NZD: { label: 'NZD — New Zealand Dollar (NZ$)', tax: 15 },
  SGD: { label: 'SGD — Singapore Dollar (S$)', tax: 9 },
  AED: { label: 'AED — UAE Dirham', tax: 5 },
  ZAR: { label: 'ZAR — South African Rand (R)', tax: 15 },
  INR: { label: 'INR — Indian Rupee (₹)', tax: 18 },
  CHF: { label: 'CHF — Swiss Franc', tax: 8.1 },
  JPY: { label: 'JPY — Japanese Yen (¥)', tax: 10 },
  HKD: { label: 'HKD — Hong Kong Dollar (HK$)', tax: 0 },
  MYR: { label: 'MYR — Malaysian Ringgit (RM)', tax: 8 },
  NOK: { label: 'NOK — Norwegian Krone (kr)', tax: 25 },
  SEK: { label: 'SEK — Swedish Krona (kr)', tax: 25 },
  DKK: { label: 'DKK — Danish Krone (kr)', tax: 25 },
  SAR: { label: 'SAR — Saudi Riyal (ر.س)', tax: 15 },
}

export const ACCENT_PRESETS = [
  '#f5a623',
  '#e05252',
  '#4caf84',
  '#64a0ff',
  '#9b59b6',
  '#1abc9c',
  '#e67e22',
  '#2c3e50',
]

export const COLOUR_PRESETS = {
  primary: ['#f5a623', '#4caf84', '#64a0ff', '#e05252', '#a855f7', '#ec4899', '#14b8a6', '#f97316'],
  secondary: [
    '#1e1e1e',
    '#0f172a',
    '#1e3a5f',
    '#1a0a2e',
    '#0d2a1e',
    '#1a0000',
    '#0a1628',
    '#2a2000',
  ],
  tertiary: [
    '#f5f5f5',
    '#f0f4ff',
    '#f0fdf4',
    '#fdf4ff',
    '#fff7ed',
    '#fef2f2',
    '#f0fdfa',
    '#fffbeb',
  ],
}

export const SAMPLE_PRODUCTS = [
  { id: 1, name: 'Web Design — Full Site', price: 2500, stock: 99, category: 'Services' },
  { id: 2, name: 'Logo Design Package', price: 500, stock: 99, category: 'Services' },
  { id: 3, name: 'Monthly SEO Retainer', price: 800, stock: 99, category: 'Services' },
  { id: 4, name: 'Brand Identity Kit', price: 1200, stock: 3, category: 'Services' },
  { id: 5, name: 'Social Media Management', price: 600, stock: 99, category: 'Services' },
  { id: 6, name: 'Photography Session', price: 350, stock: 5, category: 'Services' },
]

export const SAMPLE_INVOICES = [
  {
    id: 'INV-0001',
    customer: 'Acme Corp',
    email: 'billing@acme.com',
    date: '2026-03-15',
    due: '2026-04-15',
    status: 'paid',
    items: [{ desc: 'Web Design', qty: 1, price: 2500 }],
    tax: 10,
    notes: '',
  },
  {
    id: 'INV-0002',
    customer: 'Bright Ideas',
    email: 'hi@bright.io',
    date: '2026-03-28',
    due: '2026-04-28',
    status: 'pending',
    items: [
      { desc: 'Logo Design', qty: 1, price: 500 },
      { desc: 'Brand Kit', qty: 1, price: 1200 },
    ],
    tax: 10,
    notes: '',
  },
  {
    id: 'INV-0003',
    customer: 'DevStudio',
    email: 'pay@devstudio.co',
    date: '2026-02-10',
    due: '2026-03-10',
    status: 'pending',
    items: [{ desc: 'SEO Retainer', qty: 2, price: 800 }],
    tax: 10,
    notes: 'Follow up sent.',
  },
]
