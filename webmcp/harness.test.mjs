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
// authorized pathway, rather than handed a form it might use anyway.
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

// A declaration with several rails, shaped like moveforhunger.org/donate: a card
// checkout, a stock page that carries a URL but only instructions, and a mailed check.
// Power Poetry has one destination, so it cannot exercise a selection rule at all.
function multiRail() {
  const doc = structuredClone(declaration);
  const card = doc.giving.authorized_destinations[0];
  const auth = card.authorization;
  card.interaction = 'checkout';
  doc.giving.authorized_destinations = [
    {
      id: 'stock-transfer', type: 'stock', interaction: 'instructions', provider: null,
      url: 'https://www.powerpoetry.org/give-stock', recipient: card.recipient,
      recurring: false, designation_support: false, restrictions: 'DTC 0000.', authorization: auth,
    },
    card,
    {
      id: 'mailed-check', type: 'check', interaction: 'offline', provider: null, url: null,
      recipient: card.recipient, recurring: false, designation_support: false,
      restrictions: 'Mail to the address on file.', authorization: auth,
    },
  ];
  return doc;
}

test('giving_prepare defaults to the declared checkout, not the first URL', async () => {
  const { tools } = await load(multiRail());
  const out = await tools.giving_prepare({ amount: 50 });
  assert.equal(out.destination_id, 'givebutter-embed');
  assert.equal(out.currency, 'USD');
  assert.match(out.authorized_url, /amount=50/);
});

test('an instructions page is refused by giving_prepare, with the reason', async () => {
  const { tools } = await load(multiRail());
  await assert.rejects(
    tools.giving_prepare({ amount: 50, destination_id: 'stock-transfer' }),
    /instructions page, not a checkout/,
  );
});

test('an offline destination is refused by giving_prepare but listed by giving_options', async () => {
  const { tools } = await load(multiRail());
  await assert.rejects(
    tools.giving_prepare({ amount: 50, destination_id: 'mailed-check' }),
    /no page to prepare/,
  );
  const options = await tools.giving_options({});
  assert.deepEqual(
    options.map((o) => [o.id, o.interaction]),
    [['stock-transfer', 'instructions'], ['givebutter-embed', 'checkout'], ['mailed-check', 'offline']],
  );
});

test('without interaction, two URLs are ambiguous and the agent must choose', async () => {
  const doc = multiRail();
  for (const d of doc.giving.authorized_destinations) delete d.interaction;
  const { tools } = await load(doc);
  await assert.rejects(tools.giving_prepare({ amount: 50 }), /No destination is declared as a checkout/);
  const out = await tools.giving_prepare({ amount: 50, destination_id: 'givebutter-embed' });
  assert.equal(out.destination_id, 'givebutter-embed');
});

test('giving_options carries what giving_prepare tells agents to read from it', async () => {
  const { tools } = await load(declaration);
  const [option] = await tools.giving_options({});
  assert.equal(option.currency, 'USD');
  assert.deepEqual(option.prefill.parameters.frequency.values, ['once', 'monthly', 'yearly']);
  assert.equal(option.checkout_observed.amount_parameter_means, 'gift_to_organization');
  assert.equal(option.agent_payment.agent_may_complete_payment, false);
});

test('a designation reaches the URL only where prefill declares it', async () => {
  const { tools } = await load(declaration);
  const undeclared = await tools.giving_prepare({ amount: 50, designation: 'power-poetry' });
  assert.equal(undeclared.designation_carried, false);
  assert.ok(undeclared.prefill_rejected.includes('designation'));
  assert.doesNotMatch(undeclared.authorized_url, /designation/);

  const doc = structuredClone(declaration);
  const prefill = doc.giving.authorized_destinations[0].prefill;
  prefill.url_template += '&fund={designation}';
  prefill.parameters.designation = { kind: 'enum', values: ['power-poetry'] };
  const { tools: declared } = await load(doc);
  const out = await declared.giving_prepare({ amount: 50, designation: 'power-poetry' });
  assert.equal(out.designation_carried, true);
  assert.match(out.authorized_url, /fund=power-poetry/);
});

test('a session endpoint is surfaced from either location, and only on an owned host', async () => {
  const doc = structuredClone(declaration);
  const dest = doc.giving.authorized_destinations[0];
  dest.agent_payment.checkout_session_endpoint = 'https://www.powerpoetry.org/api/session';
  let [option] = await (await load(doc)).tools.giving_options({});
  assert.equal(option.checkout_session.endpoint, 'https://www.powerpoetry.org/api/session');

  dest.agent_payment.checkout_session_endpoint = null;
  dest.checkout_session = { endpoint: 'https://vendor.example.com/session', verified_at: '2026-10-06' };
  [option] = await (await load(doc)).tools.giving_options({});
  assert.equal(option.checkout_session, null, 'an off-host endpoint is not this destination');
});
