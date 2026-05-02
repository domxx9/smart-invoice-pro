/**
 * Save a generated file (JSON/CSV/etc.) to the user's device.
 *
 * Web: builds a Blob + object URL and clicks a hidden <a download>.
 * Native (Capacitor): writes to the Cache directory and opens the
 *   platform share sheet so the user can route it anywhere.
 *
 * Errors bubble up with a human-readable `message` so the caller can
 * surface a toast rather than failing silently.
 */

import { isNative } from '../api/platformFetch.js'

export async function shareOrDownload({ filename, content, mimeType }) {
  if (!filename) throw new Error('shareOrDownload: filename is required')
  if (content === undefined || content === null) {
    throw new Error('shareOrDownload: content is required')
  }
  if (!mimeType) throw new Error('shareOrDownload: mimeType is required')

  if (isNative()) {
    return shareNative({ filename, content, mimeType })
  }
  return downloadWeb({ filename, content, mimeType })
}

function downloadWeb({ filename, content, mimeType }) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
  return { platform: 'web', filename }
}

async function shareNative({ filename, content, mimeType }) {
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])

  await Filesystem.writeFile({
    path: filename,
    data: content,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  })

  const { uri } = await Filesystem.getUri({
    path: filename,
    directory: Directory.Cache,
  })

  await Share.share({
    title: filename,
    url: uri,
    dialogTitle: `Share ${filename}`,
  })

  return { platform: 'native', filename, uri, mimeType }
}
