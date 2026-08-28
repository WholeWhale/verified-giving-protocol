/**
 * VGP 0.1 invariants, in one place.
 *
 * `skill/scripts/validate_vgp.py` is canonical: it is what CI runs and what a
 * nonprofit runs offline. This module mirrors the same rules so the browser can
 * refuse to hand someone a file the canonical validator would reject, and both
 * /generate and /validate read it rather than carrying their own copy.
 *
 * When a rule changes in the Python validator it changes here too. There is a
 * cross-check in tests/ that runs the shared fixtures through both.
 */

export const STATEMENT = 'Our organization authorizes donations through this destination.';

export const METHODS = ['credit_card', 'ach', 'check', 'daf', 'stock', 'crypto', 'workplace', 'other'];

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DOMAIN = /^(?!-)[A-Za-z0-9.-]{1,253}$/;
const EIN = /^[0-9]{2}-[0-9]{7}$/;

function isDateTime(v) {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v));
}

/**
 * Returns an array of human-readable problems. Empty means valid.
 * Mirrors validate_vgp.py's `validate()`, minus the network URL check.
 */
export function problems(doc) {
  const p = [];
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    return ['document must be a JSON object'];
  }

  for (const k of ['vgp_version', 'canonical_domain', 'organization', 'giving', 'verification']) {
    if (!(k in doc)) p.push(`missing top-level field: ${k}`);
  }
  if (p.length) return p;

  if (doc.vgp_version !== '0.1') p.push('vgp_version must equal 0.1');

  const d = doc.canonical_domain;
  if (typeof d !== 'string' || !DOMAIN.test(d) || d.includes('://')) {
    p.push('canonical_domain must be a hostname, without scheme or path');
  }

  const o = doc.organization;
  if (typeof o !== 'object' || o === null) {
    p.push('organization must be an object');
    return p;
  }
  for (const k of ['legal_name', 'display_name', 'ein', 'country']) {
    if (!(k in o)) p.push(`organization.${k} is required`);
  }
  if (o.ein != null && (typeof o.ein !== 'string' || !EIN.test(o.ein))) {
    p.push('organization.ein must be null or NN-NNNNNNN');
  }
  if (o.country != null && (typeof o.country !== 'string' || !/^[A-Z]{2}$/.test(o.country))) {
    p.push('organization.country must be null or a two-letter uppercase code');
  }

  const g = doc.giving;
  if (typeof g !== 'object' || g === null) { p.push('giving must be an object'); return p; }
  const dests = Array.isArray(g.authorized_destinations) ? g.authorized_destinations : [];
  const desigs = Array.isArray(g.designations) ? g.designations : [];
  if (!Array.isArray(g.authorized_destinations)) p.push('giving.authorized_destinations must be an array');
  if (!Array.isArray(g.designations)) p.push('giving.designations must be an array');

  const v = doc.verification;
  if (typeof v !== 'object' || v === null) { p.push('verification must be an object'); return p; }
  const approved = v.organization_approved;
  if (typeof approved !== 'boolean') p.push('verification.organization_approved must be boolean');

  // The invariant the whole protocol rests on.
  if (approved === false && dests.length) {
    p.push('an unapproved declaration must have zero authorized destinations');
  }
  if (approved === true && !dests.length) {
    p.push('an approved declaration must contain at least one authorized destination');
  }
  if (approved === true) {
    if (!String(o.legal_name ?? '').trim()) p.push('an approved declaration requires organization.legal_name');
    if (!String(o.display_name ?? '').trim()) p.push('an approved declaration requires organization.display_name');
    if (typeof o.country !== 'string' || !/^[A-Z]{2}$/.test(o.country)) p.push('an approved declaration requires organization.country');
    if (o.country === 'US' && !o.ein) p.push('an approved US declaration requires organization.ein');
  }
  if (v.published_at != null && !isDateTime(v.published_at)) p.push('verification.published_at must be null or ISO 8601');
  if (!isDateTime(v.updated_at)) p.push('verification.updated_at must be an ISO 8601 date-time');

  const ids = new Set();
  dests.forEach((item, i) => {
    const at = `authorized_destinations[${i}]`;
    if (typeof item !== 'object' || item === null) { p.push(`${at} must be an object`); return; }
    if (typeof item.id !== 'string' || !ID.test(item.id)) p.push(`${at}.id must be a stable lowercase hyphenated ID`);
    else if (ids.has(item.id)) p.push(`${at}.id is duplicated`);
    else ids.add(item.id);
    if (!METHODS.includes(item.type)) p.push(`${at}.type is unsupported`);
    if (typeof item.recipient !== 'string' || !item.recipient.trim()) p.push(`${at}.recipient is required`);
    if (item.type !== 'check' && typeof item.url !== 'string') p.push(`${at}.url is required for online methods`);
    if (typeof item.url === 'string' && !/^https:\/\/[^/]+/.test(item.url)) p.push(`${at}.url must be an absolute HTTPS URL`);
    for (const f of ['recurring', 'designation_support']) {
      if (typeof item[f] !== 'boolean') p.push(`${at}.${f} must be boolean`);
    }
    const a = item.authorization;
    if (typeof a !== 'object' || a === null) { p.push(`${at}.authorization is required`); return; }
    if (a.status !== 'authorized') p.push(`${at}.authorization.status must equal authorized`);
    if (a.statement !== STATEMENT) p.push(`${at}.authorization.statement is invalid`);
    if (typeof a.approved_by_role !== 'string' || a.approved_by_role.trim().length < 2) p.push(`${at}.authorization.approved_by_role is required`);
    if (!isDateTime(a.approved_at)) p.push(`${at}.authorization.approved_at must be ISO 8601`);
  });

  const dids = new Set();
  desigs.forEach((item, i) => {
    const at = `designations[${i}]`;
    if (typeof item !== 'object' || item === null) { p.push(`${at} must be an object`); return; }
    if (typeof item.id !== 'string' || !ID.test(item.id)) p.push(`${at}.id must be lowercase and hyphenated`);
    else if (dids.has(item.id)) p.push(`${at}.id is duplicated`);
    else dids.add(item.id);
    if (typeof item.label !== 'string' || !item.label.trim()) p.push(`${at}.label is required`);
  });

  return p;
}
