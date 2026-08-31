/**
 * VGP 0.1 WebMCP tools.
 * Loads organization-approved data from the site's canonical VGP declaration.
 * `giving_prepare` prepares a URL; it never submits or charges a payment.
 */
(async () => {
  "use strict";

  const VGP_URL = "__VGP_URL__";
  const REQUIRED_STATEMENT =
    "Our organization authorizes donations through this destination.";

  if (!document.modelContext?.registerTool) {
    console.warn("VGP WebMCP: document.modelContext.registerTool is unavailable.");
    return;
  }

  // A page may advertise its declaration with <link rel="giving">, which spares an
  // agent already on a donation page a speculative request for a path that usually
  // does not exist. It is a hint, never an authority: section 2 makes the publishing
  // domain the authority and requires canonical_domain to match the host that served
  // the document, so a cross-origin href is refused rather than followed. Honouring
  // one would let any page nominate another organisation's declaration as its own,
  // which is the shadow donation page problem inverted.
  function declarationUrl() {
    const link = document.querySelector('link[rel="giving"]');
    if (!link || !link.getAttribute("href")) return VGP_URL;
    try {
      const resolved = new URL(link.getAttribute("href"), location.href);
      if (resolved.origin !== location.origin) {
        console.warn("VGP WebMCP: ignoring cross-origin rel=giving link.");
        return VGP_URL;
      }
      return resolved.pathname + resolved.search;
    } catch {
      return VGP_URL;
    }
  }

  const response = await fetch(declarationUrl(), {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`VGP fetch failed: ${response.status}`);

  const vgp = await response.json();
  if (vgp?.vgp_version !== "0.1") throw new Error("Unsupported VGP version.");
  if (vgp?.verification?.organization_approved !== true) {
    throw new Error("VGP document has not been approved by the organization.");
  }

  const authorized = (vgp?.giving?.authorized_destinations ?? []).filter(
    (item) =>
      item?.authorization?.status === "authorized" &&
      item?.authorization?.statement === REQUIRED_STATEMENT,
  );
  if (!authorized.length) throw new Error("VGP has no authorized destinations.");

  const designations = Array.isArray(vgp?.giving?.designations)
    ? vgp.giving.designations
    : [];

  // Fill only what the organization declared fillable.
  //
  // A consumer must never reverse-engineer a donation platform's query string.
  // Givebutter, Classy, Bloomerang and Blackbaud each name and spell these fields
  // differently, and a platform may change them without notice, so an inferred
  // parameter fails silently in the worst possible place: the donor believes they
  // set up a monthly gift and did not. Everything here comes from the declaration,
  // and anything not declared is left to the human.
  function buildPrefillUrl(destination, requested) {
    const spec = destination.prefill;
    const rejected = [];
    if (!spec || !spec.url_template) {
      for (const [key, value] of Object.entries(requested)) {
        if (value !== undefined && value !== null) rejected.push(key);
      }
      return { url: destination.url, applied: false, rejected };
    }

    let template = spec.url_template;
    const declared = spec.parameters ?? {};

    for (const [key, value] of Object.entries(requested)) {
      if (value === undefined || value === null) continue;
      const rule = declared[key];
      if (!rule) {
        rejected.push(key);
        continue;
      }
      if (rule.kind === "enum" && !(rule.values ?? []).includes(String(value))) {
        // The platform's vocabulary is the platform's. "recurring" is not "monthly".
        rejected.push(key);
        continue;
      }
      template = template.replace(`{${key}}`, encodeURIComponent(String(value)));
    }

    // Drop any placeholder left unfilled, and the query key that carried it, so a
    // literal "{frequency}" is never sent to a payment platform.
    template = template
      .replace(/[?&][^?&=]+=\{[^}]+\}/g, "")
      .replace(/\{[^}]+\}/g, "")
      .replace(/\?&/, "?")
      .replace(/[?&]$/, "");

    // A prefill template may not move the donor to another origin. If it does, the
    // declaration is not describing its own destination and is not followed.
    try {
      if (new URL(template).origin !== new URL(destination.url).origin) {
        return { url: destination.url, applied: false, rejected: [...rejected, "cross_origin_template"] };
      }
    } catch {
      return { url: destination.url, applied: false, rejected: [...rejected, "malformed_template"] };
    }

    return { url: template, applied: template !== destination.url, rejected };
  }

  await document.modelContext.registerTool({
    name: "giving_verify",
    description:
      "Return this nonprofit's organization-approved Verified Giving Protocol identity and verification metadata.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: async () => ({
      legal_name: vgp.organization.legal_name,
      display_name: vgp.organization.display_name,
      ein: vgp.organization.ein,
      canonical_domain: vgp.canonical_domain,
      vgp_version: vgp.vgp_version,
      approved: true,
      last_updated: vgp.verification.updated_at,
    }),
  });

  await document.modelContext.registerTool({
    name: "giving_options",
    description:
      "Return only the donation destinations this nonprofit explicitly lists as authorized in its VGP declaration.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: async () =>
      authorized.map((item) => ({
        id: item.id,
        method: item.type,
        provider: item.provider,
        authorized_url: item.url,
        recipient: item.recipient,
        recurring: item.recurring,
        restrictions: item.restrictions,
        designation_support: item.designation_support,
      })),
  });

  await document.modelContext.registerTool({
    name: "giving_designations",
    description:
      "Return the funds or programs this nonprofit currently permits donors to select in its approved VGP declaration.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: async () => designations,
  });

  await document.modelContext.registerTool({
    name: "giving_prepare",
    description:
      "Prepare an organization-authorized donation URL. This does not submit a form, charge a payment method, or complete a donation; the donor must authorize final payment.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["amount"],
      properties: {
        amount: {
          type: "number",
          exclusiveMinimum: 0,
          maximum: 1000000,
          description: "Proposed donation amount in the site's displayed currency.",
        },
        designation: {
          type: "string",
          description: "Optional approved designation ID.",
        },
        destination_id: {
          type: "string",
          description: "Optional authorized destination ID; defaults to the first online destination.",
        },
        frequency: {
          type: "string",
          description:
            "Optional giving frequency. Permitted values are declared per destination in prefill.parameters.frequency.values and differ between platforms; read them from giving_options rather than assuming.",
        },
      },
    },
    execute: async ({ amount, designation, destination_id, frequency }) => {
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
        throw new Error("Amount is outside the permitted range.");
      }
      if (designation && !designations.some((item) => item.id === designation)) {
        throw new Error("Designation is not listed in the approved VGP declaration.");
      }

      const destination = destination_id
        ? authorized.find((item) => item.id === destination_id)
        : authorized.find((item) => item.url);
      if (!destination?.url) {
        throw new Error("No matching authorized online destination is available.");
      }

      const prepared = buildPrefillUrl(destination, { amount, frequency });

      return {
        destination_id: destination.id,
        recipient: destination.recipient,
        authorized_url: prepared.url,
        prefill_rejected: prepared.rejected,
        requested_amount: amount,
        requested_designation: designation ?? null,
        requested_frequency: frequency ?? null,
        prefill_applied: prepared.applied,
        payment_completed: false,
        requires_human_payment_authorization: true,
      };
    },
  });
})().catch((error) => console.error("VGP WebMCP registration failed", error));
