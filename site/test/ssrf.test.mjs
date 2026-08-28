// Guards for api/fetch.js. This endpoint takes a URL from the public and
// fetches it, so these are the checks standing between it and an SSRF. They
// are cheap to run and they regress silently, which is exactly why they are
// pinned here.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addressIsPrivate, assertReachable } from '../api/fetch.js';

test('private and reserved addresses are refused', () => {
  const blocked = [
    '127.0.0.1', '127.1.2.3',        // loopback
    '10.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.1.1', // RFC1918
    '169.254.169.254',               // cloud metadata — the one that matters most
    '0.0.0.0', '100.64.0.1',         // this-network, CGNAT
    '224.0.0.1', '255.255.255.255',  // multicast / reserved
    '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1',
    'not-an-ip',                     // unparseable refuses rather than guesses
  ];
  for (const ip of blocked) {
    assert.equal(addressIsPrivate(ip), true, `${ip} must be refused`);
  }
});

test('public addresses are allowed', () => {
  for (const ip of ['1.1.1.1', '8.8.8.8', '216.150.1.1', '172.15.0.1', '172.32.0.1', '2606:4700::1111']) {
    assert.equal(addressIsPrivate(ip), false, `${ip} must be allowed`);
  }
});

test('non-HTTPS is refused', async () => {
  await assert.rejects(() => assertReachable(new URL('http://example.org/')), /HTTPS/);
});

test('literal private hosts are refused before any DNS lookup', async () => {
  for (const u of ['https://127.0.0.1/', 'https://169.254.169.254/latest/meta-data/', 'https://[::1]/']) {
    await assert.rejects(() => assertReachable(new URL(u)), /not reachable/);
  }
});

test('internal-looking names are refused', async () => {
  for (const u of ['https://localhost/', 'https://db.internal/', 'https://printer.local/']) {
    await assert.rejects(() => assertReachable(new URL(u)), /not reachable/);
  }
});
