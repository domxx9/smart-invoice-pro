import { jsPDF } from 'jspdf'
import { Share } from '@capacitor/share'
import { calcTotals } from './helpers.js'
import { logger } from './utils/logger.js'
import { isNative } from './api/platformFetch.js'

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

export function buildInvoicePDF(inv, settings) {
  const DEFAULTS = {
    primaryColor: '#f5a623',
    secondaryColor: '#1e1e1e',
    tertiaryColor: '#f5f5f5',
    showLogo: true,
    showNotes: true,
    showTaxLine: true,
    showFooter: true,
    footerText: 'Thank you for your business.',
    logo: null,
  }
  const tmpl = { ...DEFAULTS, ...(settings.pdfTemplate || {}) }
  const primary = hexToRgb(tmpl.primaryColor || '#f5a623')
  const secondary = hexToRgb(tmpl.secondaryColor || '#1e1e1e')
  const tertiary = hexToRgb(tmpl.tertiaryColor || '#f5f5f5')
  const { sub, discountLines, discountTotal, tax, total } = calcTotals(
    inv.items,
    inv.tax,
    inv.discounts,
  )
  const cFmt = (n) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: settings.currency || 'GBP',
    }).format(n || 0)

  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' })
  const W = 148
  const H = 210
  const margin = 13
  let y = 0

  // ── Column positions ──────────────────────────────────────────────
  const tableW = W - margin * 2
  const descW = tableW * 0.44
  const qtyX = margin + descW + tableW * 0.14
  const priceX = margin + descW + tableW * 0.28 + 10
  const totalX = W - margin - 1

  // ── Helpers ───────────────────────────────────────────────────────
  const drawPageBg = () => {
    doc.setFillColor(255, 255, 255)
    doc.rect(0, 0, W, H, 'F')
  }

  const drawHeaderBar = (label = 'INVOICE') => {
    doc.setFillColor(...primary)
    doc.rect(0, 0, W, 16, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(0, 0, 0)
    doc.text(label, margin, 10.5)
    doc.setFontSize(8.5)
    doc.text(inv.id, W - margin, 10.5, { align: 'right' })
  }

  const drawTableHeader = (atY) => {
    doc.setFillColor(...secondary)
    doc.rect(margin, atY, tableW, 8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...primary)
    doc.text('DESCRIPTION', margin + 3, atY + 5.5)
    doc.text('QTY', qtyX, atY + 5.5, { align: 'right' })
    doc.text('PRICE', priceX, atY + 5.5, { align: 'right' })
    doc.text('TOTAL', totalX, atY + 5.5, { align: 'right' })
    return atY + 10
  }

  // Continuation page for item overflow
  const addItemsPage = () => {
    doc.addPage()
    drawPageBg()
    drawHeaderBar('ITEMS CONTINUED')
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7)
    doc.setTextColor(160, 160, 160)
    doc.text(`Invoice ${inv.id}`, W - margin, 22, { align: 'right' })
    return drawTableHeader(26)
  }

  // ── Page 1 ───────────────────────────────────────────────────────
  drawPageBg()
  drawHeaderBar()
  y = 22

  // Logo
  if (tmpl.showLogo && tmpl.logo) {
    try {
      doc.addImage(tmpl.logo, 'JPEG', margin, y, 22, 11)
      y += 13
    } catch {
      /* skip */
    }
  }

  // ── Bill To (left) + Meta (right) ────────────────────────────────
  const colL = margin
  const colR = W / 2 + 4
  const colLW = W / 2 - margin - 4
  const topY = y

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.setTextColor(140, 140, 140)
  doc.text('BILL TO', colL, y)
  y += 4.5

  if (inv.customerBusiness) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(20, 20, 20)
    doc.text(inv.customerBusiness, colL, y, { maxWidth: colLW })
    y += 5
  }
  doc.setFont('helvetica', inv.customerBusiness ? 'normal' : 'bold')
  doc.setFontSize(inv.customerBusiness ? 8 : 9)
  doc.setTextColor(20, 20, 20)
  doc.text(inv.customer || '—', colL, y, { maxWidth: colLW })
  y += 4.5

  if (inv.email) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(100, 100, 100)
    doc.text(inv.email, colL, y, { maxWidth: colLW })
    y += 4
  }
  const addrLines = [
    inv.address1,
    inv.address2,
    [inv.city, inv.postcode].filter(Boolean).join(', '),
    inv.country,
  ].filter(Boolean)
  if (addrLines.length) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(80, 80, 80)
    addrLines.forEach((line) => {
      doc.text(line, colL, y, { maxWidth: colLW })
      y += 4
    })
  }

  // Meta right column
  ;[
    ['Invoice', inv.id],
    ['Date', inv.date || '—'],
    ['Due', inv.due || '—'],
    ['Status', (inv.status || '').toUpperCase()],
  ].forEach(([label, val], i) => {
    const my = topY + i * 5.5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(120, 120, 120)
    doc.text(label, colR, my)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(30, 30, 30)
    doc.text(val, W - margin, my, { align: 'right' })
  })

  y = Math.max(y, topY + 4 * 5.5) + 5

  // ── Table header ─────────────────────────────────────────────────
  y = drawTableHeader(y)

  // ── Line items — with page overflow ──────────────────────────────
  // Leave bottom 14mm on any page for page-number footer
  const ITEM_BOTTOM = H - 14
  let rowIdx = 0

  inv.items.forEach((item) => {
    const rowTotal = (parseFloat(item.qty) || 0) * (parseFloat(item.price) || 0)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    const descLines = doc.splitTextToSize(item.desc || '—', descW - 4)
    const rowH = Math.max(9, descLines.length * 4.5 + 4)

    if (y + rowH > ITEM_BOTTOM) {
      y = addItemsPage()
      rowIdx = 0 // reset alternating on new page
    }

    if (rowIdx % 2 === 0) {
      const [tr, tg, tb] = tertiary
      doc.setFillColor(Math.min(255, tr + 8), Math.min(255, tg + 8), Math.min(255, tb + 8))
      doc.rect(margin, y - 1, tableW, rowH, 'F')
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(20, 20, 20)
    doc.text(descLines, margin + 3, y + 3.5)
    doc.text(String(item.qty || 0), qtyX, y + 3.5, { align: 'right' })
    doc.text(cFmt(item.price), priceX, y + 3.5, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.text(cFmt(rowTotal), totalX, y + 3.5, { align: 'right' })
    y += rowH
    rowIdx++
  })

  // ── Totals + notes + business block ──────────────────────────────
  // Estimate height needed
  const notesH = tmpl.showNotes && inv.notes ? 20 : 0
  const discountsH = (discountLines?.length || 0) * 5 + (discountTotal > 0 ? 2 : 0)
  const bizAddr2 = [
    settings.address1,
    settings.address2,
    [settings.city, settings.postcode].filter(Boolean).join(', '),
    settings.country,
  ].filter(Boolean)
  const bankRowCount =
    (settings.bankName ? 1 : 0) +
    (settings.bankAccountName ? 1 : 0) +
    (settings.bankAccountNumber || settings.bankSortCode ? 1 : 0) +
    (settings.bankIban ? 1 : 0) +
    (settings.bankSwift ? 1 : 0)
  const hasPaymentBlock = bankRowCount > 0 || !!settings.paymentInstructions
  const hasCompliance = !!(settings.taxIdNumber || settings.companyNumber)
  const paymentH = hasPaymentBlock
    ? 10 + bankRowCount * 5 + (settings.paymentInstructions ? 10 : 0)
    : 0
  const complianceH = hasCompliance ? 5 : 0
  const bizH = 14 + bizAddr2.length * 5 + 4 + paymentH + complianceH
  const totalsH = 8 + 6 + discountsH + (tmpl.showTaxLine ? 7 : 0) + 14
  const endH = totalsH + notesH + bizH + 10

  if (y + endH > H - 14) {
    doc.addPage()
    drawPageBg()
    drawHeaderBar('INVOICE SUMMARY')
    y = 26
  }

  // Divider above totals
  y += 4
  doc.setDrawColor(220, 220, 220)
  doc.line(margin, y, W - margin, y)
  y += 6

  // Subtotal / Discounts / Tax / Total
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(100, 100, 100)
  doc.text('Subtotal', margin, y)
  doc.text(cFmt(sub), W - margin, y, { align: 'right' })
  y += 6
  if (discountLines && discountLines.length) {
    for (const d of discountLines) {
      const label = d.name || (d.type === 'percent' ? `Discount (${d.value}%)` : 'Discount')
      doc.text(label, margin, y)
      doc.text(`-${cFmt(d.amount)}`, W - margin, y, { align: 'right' })
      y += 5
    }
    y += 1
  }
  if (tmpl.showTaxLine) {
    doc.text(`Tax (${inv.tax || 0}%)`, margin, y)
    doc.text(cFmt(tax), W - margin, y, { align: 'right' })
    y += 7
  }
  doc.setFillColor(...primary)
  doc.rect(margin, y - 3, tableW, 10, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(0, 0, 0)
  doc.text('TOTAL', margin + 4, y + 4)
  doc.text(cFmt(total), W - margin - 2, y + 4, { align: 'right' })
  y += 14

  // Notes
  if (tmpl.showNotes && inv.notes) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(120, 120, 120)
    doc.text('NOTES', margin, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(60, 60, 60)
    doc.text(inv.notes, margin, y, { maxWidth: tableW })
    y += 12
  }

  // ── Business info block ───────────────────────────────────────────
  y += 4
  doc.setDrawColor(220, 220, 220)
  doc.line(margin, y, W - margin, y)
  y += 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...secondary)
  doc.text(settings.businessName || 'My Business', margin, y)

  let brY = y
  if (settings.email) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(80, 80, 80)
    doc.text(settings.email, W - margin, brY, { align: 'right' })
    brY += 5
  }
  if (settings.phone) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(80, 80, 80)
    doc.text(settings.phone, W - margin, brY, { align: 'right' })
  }

  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(80, 80, 80)
  bizAddr2.forEach((line) => {
    doc.text(line, margin, y)
    y += 5
  })

  // ── Payment details block ─────────────────────────────────────────
  const bankLines = []
  if (settings.bankName) bankLines.push(settings.bankName)
  if (settings.bankAccountName) bankLines.push(settings.bankAccountName)
  if (settings.bankAccountNumber && settings.bankSortCode) {
    bankLines.push(`Acct ${settings.bankAccountNumber}  ·  Sort ${settings.bankSortCode}`)
  } else if (settings.bankAccountNumber) {
    bankLines.push(`Acct ${settings.bankAccountNumber}`)
  } else if (settings.bankSortCode) {
    bankLines.push(`Sort ${settings.bankSortCode}`)
  }
  if (settings.bankIban) bankLines.push(`IBAN ${settings.bankIban}`)
  if (settings.bankSwift) bankLines.push(`SWIFT ${settings.bankSwift}`)

  if (bankLines.length || settings.paymentInstructions) {
    y += 3
    doc.setDrawColor(235, 235, 235)
    doc.line(margin, y, W - margin, y)
    y += 5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(120, 120, 120)
    doc.text('PAYMENT DETAILS', margin, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(60, 60, 60)
    for (const line of bankLines) {
      doc.text(line, margin, y, { maxWidth: W - margin * 2 })
      y += 4.5
    }
    if (settings.paymentInstructions) {
      y += 1
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(7.5)
      doc.setTextColor(90, 90, 90)
      const instr = doc.splitTextToSize(settings.paymentInstructions, W - margin * 2)
      doc.text(instr, margin, y)
      y += instr.length * 4 + 2
    }
  }

  // ── Compliance identifiers (VAT / Company Number) ─────────────────
  const complianceBits = []
  if (settings.taxIdNumber) {
    complianceBits.push(`${settings.taxIdLabel || 'Tax ID'} ${settings.taxIdNumber}`)
  }
  if (settings.companyNumber) {
    complianceBits.push(`Co. No. ${settings.companyNumber}`)
  }
  if (complianceBits.length) {
    y += 1
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(130, 130, 130)
    doc.text(complianceBits.join('  ·  '), margin, y, { maxWidth: W - margin * 2 })
    y += 4
  }

  // ── Page footers on every page ────────────────────────────────────
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    if (tmpl.showFooter && p === totalPages) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(7.5)
      doc.setTextColor(...primary)
      doc.text(tmpl.footerText || 'Thank you for your business.', W / 2, H - 8, { align: 'center' })
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(180, 180, 180)
    doc.text(
      `${inv.id}  ·  Page ${p} / ${totalPages}  ·  Generated by Smart Invoice Pro`,
      W / 2,
      H - 3,
      { align: 'center' },
    )
  }

  return doc
}

export function getPDFFilename(inv) {
  return `${inv.id}_${(inv.customer || 'invoice').replace(/\s+/g, '_')}.pdf`
}

export async function pdfFileExists(filename) {
  if (!isNative()) return false
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    await Filesystem.stat({ path: filename, directory: Directory.Documents })
    return true
  } catch {
    return false
  }
}

export async function savePDFToPhone(inv, settings, filenameOverride) {
  const doc = buildInvoicePDF(inv, settings)
  const filename = filenameOverride ?? getPDFFilename(inv)
  if (isNative()) {
    try {
      const pdfBase64 = doc.output('datauristring').split(',')[1]
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      await Filesystem.writeFile({
        path: filename,
        data: pdfBase64,
        directory: Directory.Documents,
        recursive: true,
      })
      const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Documents })
      return { uri, filename }
    } catch (e) {
      logger.error('pdf', 'savePDF error:', e)
      return { uri: null, dataUrl: null, filename, error: String(e) }
    }
  } else {
    const dataUrl = doc.output('datauristring')
    doc.save(filename)
    return { uri: null, dataUrl, filename }
  }
}

export async function openPDF(uri) {
  try {
    const { FileOpener } = await import('@capacitor-community/file-opener')
    await FileOpener.open({ filePath: uri, contentType: 'application/pdf' })
  } catch (e) {
    logger.error('pdf', 'openPDF error:', e)
  }
}

export async function sharePDF(inv, settings) {
  const doc = buildInvoicePDF(inv, settings)
  const filename = `${inv.id}_${(inv.customer || 'invoice').replace(/\s+/g, '_')}.pdf`
  if (isNative()) {
    const pdfBase64 = doc.output('datauristring').split(',')[1]
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    await Filesystem.writeFile({ path: filename, data: pdfBase64, directory: Directory.Cache })
    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache })
    await Share.share({ title: `Invoice ${inv.id}`, url: uri, dialogTitle: 'Send Invoice PDF' })
  } else {
    doc.save(filename)
  }
}
