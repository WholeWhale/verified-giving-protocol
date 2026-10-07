/**
 * VGP 0.1 WebMCP tools.
 * Loads organization-approved data from the site's canonical VGP declaration.
 * `giving_prepare` prepares a URL; it never submits or charges a payment.
 */
(async () => {
  "use strict";

  const VGP_URL = "/giving.json";
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
  // the document, so a cross-origin href is refused rather than followed. Honoring
  // one would let any page nominate another organization's declaration as its own,
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
      // Out of declared bounds is dropped, not clamped. Platforms tend to ignore an
      // out-of-range value silently, which would leave the donor on a default this
      // agent never chose while the agent believes the amount was carried. Handing
      // over an unprefilled URL is the honest outcome. Clamping would be worse
      // still: it would donate an amount nobody asked for.
      const numeric = Number(value);
      if (
        (rule.min !== undefined && numeric < rule.min) ||
        (rule.max !== undefined && numeric > rule.max)
      ) {
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

  // Which destination giving_prepare uses when the agent names none: only a declared
  // checkout. A URL does not make a page a checkout. A stock or IRA page has a URL and
  // a broker's DTC number, and handing it over with prefill_applied would describe a
  // page that cannot take an amount. A document that predates `interaction` and has
  // exactly one destination with a URL is unambiguous, so it keeps working; with two
  // or more, the agent has to choose one by id.
  function defaultDestination() {
    const checkout = authorized.find((item) => item.interaction === "checkout");
    if (checkout) return checkout;
    if (authorized.some((item) => item.interaction !== undefined)) return null;
    const withUrl = authorized.filter((item) => item.url);
    return withUrl.length === 1 ? withUrl[0] : null;
  }

  // Section 4.8. A session endpoint is reported only where it sits on a host the
  // organization already controls, the same guard prefill applies to url_template.
  // The deprecated location inside agent_payment is still read: an endpoint behind a
  // field that says no is the one a consumer most needs surfaced.
  function checkoutSession(destination) {
    const session =
      destination.checkout_session ??
      (destination.agent_payment?.checkout_session_endpoint
        ? {
            endpoint: destination.agent_payment.checkout_session_endpoint,
            verified_at: destination.agent_payment.verified_at ?? null,
          }
        : null);
    if (!session?.endpoint) return null;
    try {
      const host = new URL(session.endpoint).hostname.toLowerCase();
      const apex = String(vgp.canonical_domain).toLowerCase();
      const own = destination.url ? new URL(destination.url).hostname.toLowerCase() : null;
      if (host === own || host === apex || host.endsWith(`.${apex}`)) return session;
    } catch {
      // A malformed endpoint is not reported.
    }
    return null;
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
      "Return only the donation destinations this nonprofit explicitly lists as authorized in its VGP declaration, including instructions pages and offline methods. interaction says whether a destination takes a gift (checkout), explains how to give (instructions), or has no page (offline). prefill lists the only fields an agent may fill; checkout_observed lists what the checkout adds to the donor's charge; agent_payment says whether an agent may complete a payment (absent means no).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: async () =>
      authorized.map((item) => ({
        id: item.id,
        method: item.type,
        interaction: item.interaction ?? null,
        provider: item.provider,
        authorized_url: item.url,
        recipient: item.recipient,
        currency: item.currency ?? null,
        recurring: item.recurring,
        restrictions: item.restrictions,
        designation_support: item.designation_support,
        designation_required: item.designation_required ?? false,
        prefill: item.prefill ?? null,
        checkout_observed: item.checkout_observed ?? null,
        agent_payment: item.agent_payment ?? null,
        checkout_session: checkoutSession(item),
        platform_profile: item.platform_profile ?? null,
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
          description:
            "Optional approved designation ID. Carried into the URL only where the destination's prefill declares a designation parameter that accepts it; otherwise it is listed in prefill_rejected and the donor selects it at checkout.",
        },
        destination_id: {
          type: "string",
          description:
            "Optional authorized destination ID; defaults to the destination declared as a checkout. Required where the declaration does not make that unambiguous.",
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
        : defaultDestination();
      if (!destination) {
        throw new Error(
          destination_id
            ? "Destination is not listed as authorized in the approved VGP declaration."
            : "No destination is declared as a checkout. Choose one by destination_id from giving_options.",
        );
      }
      // Both are authorized and both are real ways to give; neither takes an amount.
      // Refusing here, with the reason, lets the agent describe them to the donor
      // from giving_options instead of handing over a URL as though it were a checkout.
      if (destination.interaction === "offline" || !destination.url) {
        throw new Error(
          `Destination ${destination.id} has no page to prepare. Describe it to the donor from giving_options.`,
        );
      }
      if (destination.interaction === "instructions") {
        throw new Error(
          `Destination ${destination.id} is an instructions page, not a checkout, and cannot carry an amount. Give the donor its authorized_url from giving_options.`,
        );
      }

      const prepared = buildPrefillUrl(destination, { amount, frequency, designation });

      return {
        destination_id: destination.id,
        recipient: destination.recipient,
        authorized_url: prepared.url,
        currency: destination.currency ?? null,
        prefill_rejected: prepared.rejected,
        requested_amount: amount,
        requested_designation: designation ?? null,
        requested_frequency: frequency ?? null,
        designation_carried: Boolean(designation) && prepared.applied && !prepared.rejected.includes("designation"),
        designations_honored: destination.checkout_observed?.designations_honored ?? null,
        prefill_applied: prepared.applied,
        payment_completed: false,
        requires_human_payment_authorization: true,
      };
    },
  });
})().catch((error) => console.error("VGP WebMCP registration failed", error));
