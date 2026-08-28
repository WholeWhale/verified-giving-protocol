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
 * SECURITY: this takes a URL from the public and fetches it, so it is an SSRF
 * primitive unless every hop is controlled. Three things do that work:
 *
 *   - Redirects are followed MANUALLY, with the full host and address check
 *     re-run on every hop. `redirect: 'follow'` would apply the checks to hop
 *     zero and nothing else, which is the whole vulnerability.
 *   - The hostname is RESOLVED and the resulting addresses are checked against
 *     private and reserved ranges. Checking a hostname string is not a network
 *     control: a public name can resolve to 127.0.0.1.
 *   - The body is read as a STREAM against a running byte count. Buffering the
 *     whole response and then measuring it applies the limit after the damage.
 *
 * It reads and reports. It stores nothing.
 */

import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 8000;
const MAX_HOPS = 3;

function ipv4IsPrivate(ip) {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||                                   // this network
    a === 10 ||                                  // RFC1918
    a === 127 ||                                 // loopback
    (a === 169 && b === 254) ||                  // link-local, incl. cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||         // RFC1918
    (a === 192 && b === 168) ||                  // RFC1918
    (a === 100 && b >= 64 && b <= 127) ||        // CGNAT
    (a === 192 && b === 0) ||                    // IETF protocol assignments
    a === 198 && (b === 18 || b === 19) ||       // benchmarking
    a >= 224                                     // multicast + reserved
  );
}

function ipv6IsPrivate(ip) {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (v === '::1' || v === '::') return true;
  if (v.startsWith('fe80')) return true;                 // link-local
  if (/^f[cd]/.test(v)) return true;                     // unique local
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v); // IPv4-mapped
  if (mapped) return ipv4IsPrivate(mapped[1]);
  return false;
}

export function addressIsPrivate(ip) {
  const family = net.isIP(ip);
  if (family === 4) return ipv4IsPrivate(ip);
  if (family === 6) return ipv6IsPrivate(ip);
  return true; // unparseable: refuse rather than guess
}

/** Validate one hop. Resolves the hostname and checks every address it returns. */
export async function assertReachable(url) {
  if (url.protocol !== 'https:') {
    throw new Error('VGP declarations must be served over HTTPS.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');

  if (net.isIP(host)) {
    if (addressIsPrivate(host)) throw new Error('That address is not reachable from here.');
    return;
  }
  if (/(^|\.)(localhost|local|internal|localdomain)$/i.test(host)) {
    throw new Error('That host is not reachable from here.');
  }

  let records;
  try {
    records = await dns.lookup(host, { all: true });
  } catch {
    throw new Error(`Could not resolve ${host}.`);
  }
  if (!records.length) throw new Error(`Could not resolve ${host}.`);
  // Every address must be public. One private answer is enough to refuse.
  for (const { address } of records) {
    if (addressIsPrivate(address)) throw new Error('That host resolves to a private address.');
  }
}

/** Read at most MAX_BYTES, aborting the transfer rather than buffering past it. */
async function readCapped(response) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared && declared > MAX_BYTES) {
    throw new Error('That document is too large to be a VGP declaration.');
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error('That document is too large to be a VGP declaration.');
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(
    chunks.reduce((acc, c) => {
      const out = new Uint8Array(acc.length + c.length);
      out.set(acc); out.set(c, acc.length);
      return out;
    }, new Uint8Array(0)),
  );
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const target = (req.query?.url || '').toString().trim();
  if (!target) return res.status(400).json({ error: 'Provide a ?url= parameter.' });

  let url;
  try {
    url = new URL(target);
  } catch {
    return res.status(400).json({ error: 'That is not a valid URL.' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const chain = [];

  try {
    for (let hop = 0; ; hop++) {
      await assertReachable(url);
      chain.push(url.toString());

      const upstream = await fetch(url.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'VGP-Validator/0.1 (+https://verifiedgiving.ai)',
        },
      });

      if (upstream.status >= 300 && upstream.status < 400) {
        const location = upstream.headers.get('location');
        if (!location) throw new Error(`Redirect with no Location header (HTTP ${upstream.status}).`);
        if (hop >= MAX_HOPS) throw new Error(`Too many redirects (more than ${MAX_HOPS}).`);
        url = new URL(location, url); // re-validated at the top of the next iteration
        continue;
      }

      const contentType = upstream.headers.get('content-type') || '';
      const body = await readCapped(upstream);

      return res.status(200).json({
        ok: upstream.ok,
        status: upstream.status,
        finalUrl: chain[chain.length - 1],
        redirected: chain.length > 1,
        chain,
        contentType,
        body,
      });
    }
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return res.status(200).json({
      ok: false,
      chain,
      error: aborted ? 'The request timed out.' : (err?.message ?? 'Could not reach that URL.'),
    });
  } finally {
    clearTimeout(timer);
  }
}
