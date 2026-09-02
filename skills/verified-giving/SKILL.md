---
name: verified-giving
description: Create, authorise and publish your own Verified Giving Protocol declaration at /giving.json, so AI agents route donations to the destinations your organisation authorised instead of guessing. Use for requests such as "set up VGP for our nonprofit", "publish a giving.json", "make our donate page agent-readable", or "verify our donation page is agent-readable". Never authorise a destination on the organisation's behalf.
---

# Verified Giving

Walk a nonprofit through publishing its own VGP declaration. The organisation already
knows its own facts — this skill's job is to get them into a valid file, refuse to
authorise anything on their behalf, and make sure agents can actually find the result.

**This is not [[vgpify]].** VGPify crawls a nonprofit's site and gathers evidence, for
someone auditing an organisation from the outside. This skill is for the organisation
itself, which does not need to be told what its own donate page says.

## Non-negotiable trust rule

You are drafting. **You may never authorise.**

A destination becomes authorised only when a person at the nonprofit affirms, **verbatim**:

> Our organization authorizes donations through this destination.

That exact string, with the full stop. Not "yes", not "approved", not "I authorise it", not
a rewording that means the same thing. `scripts/approve_destination.py` compares it as a
constant and the JSON Schema declares it a `const`, so a paraphrase cannot be written into a
declaration even by accident.

If the person you are talking to is not authorised to make that statement for the
organisation, stop and tell them who needs to. Do not accept it second-hand.

## Workflow

### 1. Establish the canonical domain

Ask which domain the organisation controls and will serve the file from. This is the domain
whose ownership *is* the authority — it must be the organisation's own, never a fundraising
platform's, never an aggregator's.

Check what it does today:

```bash
curl -sSI https://<domain>/giving.json
curl -sSI https://<domain>/robots.txt
```

`robots.txt` tells you whether the apex serves root files without redirecting. If the apex
redirects to `www` but `robots.txt` does not, root files are fine and `canonical_domain`
should be the apex. If everything redirects, `canonical_domain` must be the host that
actually serves the file — §2 requires the two to match.

### 2. Identify the receiving legal entity

Two different facts, routinely conflated:

- **`legal_name`** — the entity that legally receives the gift and appears on the receipt.
- **`display_name`** — the programme or brand the public knows.

They are allowed to differ, and under fiscal sponsorship they usually do. Do not collapse
them.

**Verify the EIN rather than accepting it.** For a US organisation:

```bash
curl -s "https://projects.propublica.org/nonprofits/api/v2/organizations/<9-digit-EIN>.json"
```

Read back `name` and `subsection_code` and confirm them with the person. This routinely
catches a legal name that differs from what they typed — a missing "Inc", a former name, a
merged entity. `approve_destination.py` refuses to publish a US organisation without an EIN,
so this is not optional.

### 3. Establish each donation pathway

For every route money can arrive by, ask:

| Field | Ask |
|---|---|
| `type` | card, ACH, cheque, DAF, stock, workplace, crypto, other |
| `url` | where a donor actually goes; `null` for offline methods |
| `provider` | the processor, if there is one |
| `recipient` | **the name the approved flow actually shows the donor** |
| `currency` | ISO 4217; required for online methods, and never inferred from country |
| `recurring` | can a donor set up a repeating gift |
| `designation_support` | can the donor **choose** a fund at checkout |
| `restrictions` | plain-language limits, or `null` |

Two traps worth stating plainly:

- **`recipient` is not always `legal_name`.** It is whatever the checkout shows. Where they
  differ for legitimate reasons that is a fiscal structure; where they differ for
  illegitimate reasons that difference is the signal, and collapsing the fields erases it.
- **`designation_support` means donor choice, not earmarking.** If every gift through a
  destination goes to one programme because the organisation directs it there, that is
  `false` plus a sentence in `restrictions`. Setting it `true` tells an agent to offer a
  choice that does not exist.

### 4. Establish the prefill contract, by testing it

If the donate page accepts URL parameters, an agent can hand a donor a checkout with the
amount and frequency already set. **Never infer these parameters** — platforms name them
differently, change them without notice, and ignore bad values in silence, so a guess fails
where it costs most: the donor believes a monthly gift is set up and it is not.

Test the live page instead. Load it with candidate parameters and read the form's actual
state, not the page copy around it:

```
https://<their-donate-page>?amount=50&frequency=monthly
```

Then confirm with them what the form shows. Record only what you observed:

```json
"prefill": {
  "url_template": "https://example.org/donate?amount={amount}&frequency={frequency}",
  "parameters": {
    "amount":    { "kind": "amount", "min": 1, "max": 999 },
    "frequency": { "kind": "enum", "values": ["once", "monthly", "yearly"] }
  },
  "verified_at": "<today>"
}
```

**Find the ceiling.** Platforms often ignore an amount above some limit rather than
rejecting it. Try a large value and record what actually happens. A vendor's documentation
describes the product, not this deployment — test the specific donation page.

Omit `prefill` entirely if nothing is verified. A missing block is honest; a wrong one is not.

### 5. Get the authorisation

Show the person the exact destination they are about to authorise — recipient, method,
provider, URL, currency, restrictions — and ask them to type the affirmation and give their
role at the organisation.

Then run the canonical script. Do not hand-write the authorisation block:

```bash
python3 scripts/approve_destination.py \
  --review review.json \
  --vgp giving.json \
  --candidate-id <destination-id> \
  --approver-role "<their role>" \
  --statement "Our organization authorizes donations through this destination."
```

It refuses on unresolved identity, an unknown candidate, or any statement that is not the
constant. Those refusals are the point.

### 6. Validate before publishing

```bash
python3 scripts/validate_vgp.py giving.json
```

A **valid unapproved draft** is a legitimate, conformant state, not a failure. It authorises
nothing, and a conforming agent will expose no giving tools for it. That is correct
behaviour — say so rather than treating it as an error to fix.

### 7. Publish at the document root

```
https://<canonical-domain>/giving.json
```

Served as `application/json` over HTTPS, avoiding redirects. The root, next to `robots.txt`
and `ads.txt` — this is a policy file the owner publishes, not protocol metadata, so it does
not belong under `/.well-known/`.

Per stack: `public/giving.json` for Next.js, Astro, Nuxt and most static hosts; the web root
for Apache and nginx; the theme or a plugin route for WordPress. If a platform will not serve
a root file, that is worth knowing before the rest of the work.

Verify from outside the network, not from the browser that has it cached:

```bash
curl -sSI https://<canonical-domain>/giving.json
curl -s https://<canonical-domain>/giving.json | python3 -m json.tool
```

Check the status is 200, the media type is `application/json`, there is no redirect, and
`canonical_domain` matches the host that served it.

### 8. Advertise it — publishing is not discovery

**Do not skip this.** No agent probes `/giving.json` yet, because the protocol has almost no
consumers. A correct declaration that nothing looks for is invisible, and an organisation
that does everything right and sees no effect will conclude the standard does not work.

Set up all four, in this order — cheapest and most effective first:

1. **A visible link on the donation page.** `<a href="/giving.json">` is the only mechanism
   that works with an agent which has never heard of VGP, because following a link needs no
   convention to have been adopted. It also keeps the file readable by a programme officer or
   a journalist.
2. **Schema.org markup on the same page.** Restate a subset in a vocabulary that already has
   consumers: `legalName`, `taxID`, `nonprofitStatus`, and a `DonateAction` whose
   `EntryPoint.urlTemplate` carries the same prefill contract. Derive every value from the
   declaration and say in a comment that the declaration wins — this is a bridge, never a
   second source of truth.
3. **An `/llms.txt` entry**, if the site publishes one, naming the declaration as
   authoritative and this file as possibly stale.
4. **`<link rel="giving" type="application/json" href="/giving.json">`** in the head. Costs
   nothing today, matters once consumers exist.

### 9. Optionally register the WebMCP tools

If the organisation wants agents on its donate page to get typed tools rather than a page to
parse, serve `giving-tools.js` and add one script tag. The tools **fail closed**: a missing,
unapproved or wrongly served declaration registers no giving tools at all, so an agent is
told there is no authorised pathway rather than handed a form it might guess at.

### 10. Confirm it end to end

Check the domain at <https://verifiedgiving.ai/validate>. It should report a valid, approved
declaration naming the receiving entity, and offer a registry listing.

## Output language

- Never call an undeclared destination fraudulent. A destination absent from a declaration is
  **not listed as authorized** — that is a void in the record, not a finding about anyone.
  Absence is not accusation.
- Never say a donation was completed. Nothing in VGP moves money.
- When identity is unresolved, say which field is missing and who can answer it. Do not guess
  a legal name or an EIN, ever.
