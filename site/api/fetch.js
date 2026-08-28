/**
 * Fetch a published VGP declaration on the caller's behalf.
 *
 * This exists for two reasons a browser cannot handle itself:
 *   1. Cross-origin reads of another domain's /.well-known/giving.json are
 *      blocked unless that site sends CORS headers, and almost none will.
 *   2. Content-Type is part of conformance. A declaration served as text/html
 *      is a real failure — it is exactly what a parked domain returns — and the
 *      browser cannot see the header on an opaque cross-origin response.
 *
 * It reads and reports. It stores nothing and follows nothing but the URL given.
 */

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 8000;

// Block obvious internal targets. This endpoint takes a URL from the public,
// so it must not become a probe for the network it runs in.
const BLOCKED_HOST = /^(localhost$|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|.*\.internal$|.*\.local$)/i;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const target = (req.query?.url || '').toString().trim();
  if (!target) return res.status(400).json({ error: 'Provide a ?url= parameter.' });

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return res.status(400).json({ error: 'That is not a valid URL.' });
  }
  if (parsed.protocol !== 'https:') {
    return res.status(400).json({ error: 'VGP declarations must be served over HTTPS.' });
  }
  if (BLOCKED_HOST.test(parsed.hostname)) {
    return res.status(400).json({ error: 'That host is not reachable from here.' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(parsed.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'VGP-Validator/0.1 (+https://verifiedgiving.ai)' },
    });

    const contentType = upstream.headers.get('content-type') || '';
    const body = await upstream.text();

    if (body.length > MAX_BYTES) {
      return res.status(413).json({ error: 'That document is too large to be a VGP declaration.' });
    }

    return res.status(200).json({
      ok: upstream.ok,
      status: upstream.status,
      finalUrl: upstream.url,
      redirected: upstream.url !== parsed.toString(),
      contentType,
      body,
    });
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return res.status(200).json({
      ok: false,
      error: aborted ? 'The request timed out.' : `Could not reach that URL: ${err?.message ?? 'unknown error'}`,
    });
  } finally {
    clearTimeout(timer);
  }
}
