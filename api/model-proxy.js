/**
 * Vercel Edge Function — model download proxy
 * Fetches model from GitHub Releases server-side (no CORS issue)
 * and streams it back to the browser.
 */

export const config = { runtime: 'edge' }

const MODEL_URLS = {
  small: 'https://github.com/domxx9/smart-invoice-pro/releases/download/v1.0-models/Qwen2.5-0.5B-Instruct_multi-prefill-seq_q8_ekv1280.task',
  pro:   'https://github.com/domxx9/smart-invoice-pro/releases/download/v1.0-models/Qwen2.5-1.5B-Instruct_multi-prefill-seq_q8_ekv4096.task',
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  const url = MODEL_URLS[id]
  if (!url) {
    return new Response(JSON.stringify({ error: 'Unknown model id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Fetch server-side — no CORS restriction here
  const upstream = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'SmartInvoicePro/1.0' },
  })

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: `Upstream ${upstream.status}` }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const contentLength = upstream.headers.get('content-length')

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${id}.task"`,
      ...(contentLength ? { 'Content-Length': contentLength } : {}),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
