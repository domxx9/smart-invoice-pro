import sharp from 'sharp'

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- Background -->
  <rect width="512" height="512" rx="96" fill="#0a0a0b"/>

  <!-- Document body -->
  <rect x="136" y="88" width="240" height="300" rx="16" fill="#1c1c1f" stroke="#2a2a2e" stroke-width="4"/>

  <!-- Folded corner -->
  <path d="M316 88 L376 148 L316 148 Z" fill="#0a0a0b"/>
  <path d="M316 88 L376 148 L316 148 Z" fill="none" stroke="#2a2a2e" stroke-width="4" stroke-linejoin="round"/>

  <!-- Lines on document -->
  <rect x="168" y="188" width="120" height="10" rx="5" fill="#2a2a2e"/>
  <rect x="168" y="216" width="80"  height="10" rx="5" fill="#2a2a2e"/>
  <rect x="168" y="264" width="176" height="8"  rx="4" fill="#2a2a2e"/>
  <rect x="168" y="284" width="176" height="8"  rx="4" fill="#2a2a2e"/>
  <rect x="168" y="304" width="176" height="8"  rx="4" fill="#2a2a2e"/>

  <!-- Total line accent -->
  <rect x="168" y="336" width="176" height="2" rx="1" fill="#f5a623" opacity="0.4"/>
  <rect x="264" y="348" width="80"  height="12" rx="6" fill="#f5a623"/>

  <!-- Dollar coin badge -->
  <circle cx="360" cy="360" r="72" fill="#0a0a0b"/>
  <circle cx="360" cy="360" r="60" fill="#f5a623"/>
  <text x="360" y="382" font-family="system-ui, sans-serif" font-size="72" font-weight="800"
        fill="#000" text-anchor="middle">$</text>
</svg>
`

async function generate() {
  const buf = Buffer.from(svg)

  await sharp(buf).resize(1024, 1024).png().toFile('public/icon-1024.png')
  console.log('✓ icon-1024.png')

  await sharp(buf).resize(512, 512).png().toFile('public/icon-512.png')
  console.log('✓ icon-512.png')

  await sharp(buf).resize(192, 192).png().toFile('public/icon-192.png')
  console.log('✓ icon-192.png')
}

generate().catch(err => { console.error(err); process.exit(1) })
