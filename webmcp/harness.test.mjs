// Does giving-tools.js register the right tools, and refuse to register any when
// the declaration is unapproved?
//
// No browser and no dependencies. giving-tools.js touches exactly three ambient
// things — document.modelContext, document.querySelector, and fetch — so they are
// stubbed here rather than driven through a real client. That matters because no
// shipping client implements WebMCP yet: this harness is the only way to test the
// tools until one does, and it must run wherever the rest of the suite runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const declaration = JSON.parse(
  readFileSync(fileURLToPath(new URL('../powerpoetry/giving.json', import.meta.url)), 'utf8'),
);

const TOOLS_SRC = readFileSync(
  fileURLToPath(new URL('./giving-tools.js', import.meta.url)),
  'utf8',
);

/**
 * Run giving-tools.js against a given declaration, capturing what it registers.
 *
 * Evaluated with `new Function` rather than imported. The file has no ESM syntax —
 * it is a bare async IIFE — and dynamic import caches it by URL, so a second call
 * silently did not re-execute and read as "registered nothing". Evaluating the
 * source gives every call a genuinely fresh run.
 */
async function load(doc) {
  const registered = [];
  const tools = {};
  const warnings = [];
  let settled = false;

  const capture = (...args) => {
    warnings.push(args.map((a) => (a && a.message) || String(a)).join(' '));
    settled = true;
  };

  const documentStub = {
    // No <link rel="giving">, so the module falls back to the canonical path.
    querySelector: () => null,
    modelContext: {
      registerTool: async (t) => {
        registered.push(t.name);
        tools[t.name] = t.execute;
        if (registered.length >= 4) settled = true;
      },
    },
  };
  const fetchStub = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => doc,
  });

  // Inject the three ambient things the module touches as explicit parameters.
  const run = new Function('document', 'location', 'fetch', 'console', TOOLS_SRC);
  run(
    documentStub,
    { href: 'https://example.org/donate', origin: 'https://example.org' },
    fetchStub,
    { ...console, warn: capture, error: capture },
  );

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && !settled) {
    await new Promise((r) => setTimeout(r, 5));
  }
  return { registered, tools, warnings };
}

test('an approved declaration registers all four tools', async () => {
  const { registered } = await load(declaration);
  assert.deepEqual(registered.sort(), [
    'giving_designations', 'giving_options', 'giving_prepare', 'giving_verify',
  ]);
});

test('giving_verify reports the receiving legal entity, not the brand', async () => {
  const { tools } = await load(declaration);
  const out = await tools.giving_verify({});
  assert.equal(out.legal_name, 'To Be Heard Foundation Inc');
  assert.equal(out.display_name, 'Power Poetry');
});

test('giving_prepare prefills and does not pay', async () => {
  const { tools } = await load(declaration);
  const out = await tools.giving_prepare({ amount: 50, frequency: 'monthly' });
  assert.match(out.authorized_url, /amount=50/);
  assert.match(out.authorized_url, /frequency=monthly/);
  assert.equal(out.prefill_applied, true);
  assert.equal(out.payment_completed, false);
  assert.equal(out.requires_human_payment_authorization, true);
});

// The property the protocol most depends on. An agent must be told there is no
// authorised pathway, rather than handed a form it might use anyway.
test('an UNAPPROVED declaration registers NO tools at all', async () => {
  const unapproved = structuredClone(declaration);
  unapproved.verification.organization_approved = false;
  unapproved.giving.authorized_destinations = [];

  const { registered, warnings } = await load(unapproved);
  assert.deepEqual(registered, [], 'fail-closed: nothing may register');
  assert.ok(
    warnings.some((w) => /not been approved/i.test(w)),
    'the refusal should say why',
  );
});
