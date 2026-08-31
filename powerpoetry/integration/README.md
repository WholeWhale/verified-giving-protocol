# Serving VGP and registering the WebMCP tools

This is the site-side half of a VGP implementation. It applies to any nonprofit site, not
just Power Poetry.

Nothing here should be deployed for Power Poetry until the questions in
[`../UNRESOLVED.md`](../UNRESOLVED.md) are answered and an administrator has approved at
least one destination. The file in this directory's parent is a draft.

## 1. Serve the declaration

Publish the approved document at the canonical well-known path:

```
https://<canonical-domain>/giving.json
```

Requirements:

- `Content-Type: application/json`
- HTTPS, served from the same origin as the site
- `canonical_domain` inside the document matches the host serving it
- No redirect chain where it can be avoided

For a Next.js app, a file at `public/giving.json` is served at that path directly. The
same is true of most static hosts and CMSs: this is the same place `robots.txt` and
`ads.txt` live, and anything that can serve those can serve this. That is part of why the
location is the document root rather than a dotted directory, which several Apache and
nginx defaults deny outside of ACME challenges.

Verify from outside your network before believing it works:

```bash
curl -sSI https://<canonical-domain>/giving.json
curl -sS  https://<canonical-domain>/giving.json | python -m json.tool
```

## 2. Register the tools

`../../webmcp/giving-tools.js` is generated from the skill template and defaults to
fetching `/giving.json` on the current origin. If your document lives
elsewhere, regenerate rather than hand-editing:

```bash
python ../../skill/scripts/generate_webmcp.py \
  --output giving-tools.js \
  --vgp-url /giving.json
```

Include it on the pages where a donor would plausibly ask an agent for help — the donate
page at minimum, ideally the homepage too:

```html
<script type="module" src="/giving-tools.js"></script>
```

The script is defensive by design. It registers nothing at all when:

- `document.modelContext.registerTool` is unavailable (no WebMCP in this browser)
- the document cannot be fetched, or is not `vgp_version` `0.1`
- `verification.organization_approved` is not `true`
- no destination carries both `authorization.status === "authorized"` and the exact
  affirmation statement

Failing closed is the intended behavior. A site with a draft declaration exposes no giving
tools rather than exposing unauthorized ones.

## 3. Confirm it works somewhere that is not your laptop

The Challenge is judged by someone opening a live URL in a clean browser. Test the same
way:

1. Open the deployed page in a WebMCP-capable browser or ChatGPT's in-app browser.
2. Confirm `giving_verify`, `giving_options`, `giving_designations`, and `giving_prepare`
   are discovered.
3. Ask for donation options and check the returned destinations against the published
   `giving.json` by eye.
4. Call `giving_prepare` and confirm the response carries
   `payment_completed: false` and `requires_human_payment_authorization: true`, and that
   no charge occurred.

`giving_prepare` prepares a URL. It never submits a form and never moves money.
