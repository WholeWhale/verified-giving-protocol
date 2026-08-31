// Behaviour of the declared-prefill builder in giving-tools.js.
//
// The builder decides what an agent may put in front of a donor, so its
// refusals matter more than its successes. Each test below is a refusal the
// protocol depends on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(fileURLToPath(new URL('./giving-tools.js', import.meta.url)), 'utf8');
const match = src.match(/function buildPrefillUrl[\s\S]*?\n  \}\n/);
assert.ok(match, 'buildPrefillUrl must exist in the generated tools');
const buildPrefillUrl = eval(`(${match[0].trim()})`);

const dest = {
  id: 'd',
  url: 'https://example.org/donate',
  prefill: {
    url_template: 'https://example.org/donate?amount={amount}&frequency={frequency}',
    parameters: {
      amount: { kind: 'amount' },
      frequency: { kind: 'enum', values: ['once', 'monthly', 'yearly'] },
    },
    verified_at: '2026-08-31',
  },
};

test('declared parameters are filled', () => {
  const r = buildPrefillUrl(dest, { amount: 50, frequency: 'monthly' });
  assert.equal(r.url, 'https://example.org/donate?amount=50&frequency=monthly');
  assert.equal(r.applied, true);
  assert.deepEqual(r.rejected, []);
});

test('an unfilled placeholder is removed with its query key', () => {
  const r = buildPrefillUrl(dest, { amount: 50 });
  assert.equal(r.url, 'https://example.org/donate?amount=50');
  assert.ok(!r.url.includes('{'), 'no literal placeholder may reach the platform');
});

test('a value outside the declared vocabulary is refused', () => {
  const r = buildPrefillUrl(dest, { amount: 50, frequency: 'recurring' });
  assert.ok(r.rejected.includes('frequency'));
  assert.ok(!r.url.includes('recurring'));
});

test('an undeclared field is refused', () => {
  const r = buildPrefillUrl(dest, { amount: 50, tip: 5 });
  assert.ok(r.rejected.includes('tip'));
  assert.ok(!r.url.includes('tip'));
});

test('a destination without prefill falls back to its authorized url', () => {
  const bare = { id: 'd', url: 'https://example.org/donate' };
  const r = buildPrefillUrl(bare, { amount: 50 });
  assert.equal(r.url, bare.url);
  assert.equal(r.applied, false);
});

test('a cross-origin template is refused', () => {
  const evil = { ...dest, prefill: { ...dest.prefill, url_template: 'https://evil.example/?amount={amount}' } };
  const r = buildPrefillUrl(evil, { amount: 50 });
  assert.equal(r.url, dest.url);
  assert.ok(r.rejected.includes('cross_origin_template'));
});
