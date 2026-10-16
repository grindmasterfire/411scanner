/**
 * @file functions/registryLedger.js
 * @class Class 1 (Focused Logic Component)
 * @cap 120 Lines
 * @responsibility (1) Write the domain registry's own values (registrar,
 *   registered / updated / expires dates, registrant when public) into the
 *   ledger's domain_registration block, replacing the model's.
 *   (2) Scrub state codes out of ledger VALUE fields: a value never reads
 *   "searched_redacted"; the field is left empty and its evidence row says
 *   why, in a sentence.
 * @dependencies none (receipt stamping and reason sentences passed in)
 * @security_gate Values only from the probe's RDAP measurement. Never
 *   invents a value; a redacted registrant stays empty, with the reason.
 * @owner_context fire 2026-10-16 (UAC 4u): "we don't sell 'redacted'. If we
 *   can't fill the dossier with the requested info, we sell the customer
 *   exactly why we couldn't." The model had written "searched_redacted" as
 *   the registration DATES, which RDAP always publishes.
 */

// A ledger value that is really a status code, not a fact.
const STATE_CODE = /^\s*(searched_[a-z_]+|unresolved|not_found|not_researched|not_applicable|unknown|verified)\s*$/i;

/** Measured registry values into technical_ledger.domain_registration. */
function applyRegistryValues(report, probe, stampReceipt, sourceUrl) {
  if (!report || !probe || !probe.measured) return;
  const ledger = report.technical_ledger || (report.technical_ledger = {});
  const reg = ledger.domain_registration || (ledger.domain_registration = {});
  const apex = probe.apex_domain || probe.domain || "this domain";

  if (probe.registrar) reg.registrar = probe.registrar;

  const d = probe.registration_dates || {};
  if (d.registered) reg.registered_on = d.registered;
  if (d.updated) reg.updated_on = d.updated;
  if (d.expires) reg.expires_on = d.expires;
  if (d.registered || d.updated || d.expires) {
    const parts = [
      d.registered && `registered on ${d.registered}`,
      d.updated && `last updated on ${d.updated}`,
      d.expires && `set to expire on ${d.expires}`,
    ].filter(Boolean);
    stampReceipt(
      "domain_registration.registered_on",
      `The official registry record shows ${apex} was ${parts.join(", ")}.`,
      sourceUrl,
      "verified",
      { authority: "Domain registry (RDAP)", identifier: d.registered || d.updated || d.expires }
    );
  }

  const r = probe.registrant;
  if (!r && probe.registrar) {
    // The registry answered but publishes no registrant at all (GoDaddy
    // .com, 2026-10-16). Say so, and say where the operator IS identified.
    reg.registrant_name = "";
    reg.registrant_organization = "";
    const operator = (ledger.attribution && ledger.attribution.operator_name) || "";
    stampReceipt(
      "domain_registration.registrant",
      `The registry record for ${apex} does not publish the registrant: ${probe.registrar} withholds the owner's name and address.` +
        (operator
          ? ` The operator, ${operator}, is identified from business records instead (see Operator and Business Address).`
          : " The operator has to be identified from business records instead."),
      sourceUrl,
      "searched_redacted",
      { authority: "Domain registry (RDAP)", identifier: probe.registrar }
    );
  }
  if (r) {
    if (r.country) reg.registrant_country = r.country;
    if (r.redacted) {
      // Privacy-protected: no name to sell. Empty, and the registrant row
      // (networkProbe) says why and where the operator is identified instead.
      reg.registrant_name = "";
      reg.registrant_organization = "";
    } else {
      if (r.name) reg.registrant_name = r.name;
      if (r.org) reg.registrant_organization = r.org;
    }
  }
}

/**
 * The registry has no record of the domain: say so, with the ICANN lookup
 * as the source the customer can open. Replaces any model claim about the
 * domain's WHOIS (it can't be "privacy-shielded" if it doesn't exist).
 */
function applyNotRegistered(report, domain, checkedOn = new Date().toISOString().slice(0, 10)) {
  const ledger = report.technical_ledger || (report.technical_ledger = {});
  const reg = ledger.domain_registration || (ledger.domain_registration = {});
  for (const k of ["registrar", "registered_on", "updated_on", "expires_on", "registrant_name", "registrant_organization", "registrant_country"]) reg[k] = "";
  const receipts = Array.isArray(ledger.evidence_receipts) ? ledger.evidence_receipts : (ledger.evidence_receipts = []);
  const source = `https://lookup.icann.org/en/lookup?name=${encodeURIComponent(domain)}`;
  const rows = [
    ["domain_registration.registrar",
      `The domain registry has no record of ${domain} (checked ${checkedOn}): it is not registered, so it has no registrar, owner, or dates. The address on this specimen leads nowhere: it was never registered, has expired, or was taken down.`],
    ["domain_registration.registrant",
      `No one owns ${domain}: it is not registered, so there is no registrant record to look up.`],
  ];
  for (const [field, finding] of rows) {
    const row = { field, status: "searched_not_found", finding, authority: "Domain registry (RDAP)", source_url: source, subject: domain, identifier: "not registered" };
    const at = receipts.findIndex((r) => r && r.field === field);
    if (at >= 0) receipts[at] = row; else receipts.push(row);
  }
}

/** Ledger blocks whose fields are values shown to the customer. */
const VALUE_BLOCKS = ["attribution", "domain_registration", "infrastructure", "network_telemetry", "monetization", "regulatory_record"];

/**
 * Any value that is a state code becomes empty, and its field gets an
 * evidence row with a sentence (the model's own row if it wrote one).
 * Runs on every delivered report, cached ones included. Returns the
 * cleared field paths.
 */
function scrubStateCodes(report, reasonFor) {
  const ledger = report && report.technical_ledger;
  if (!ledger) return [];
  const receipts = Array.isArray(ledger.evidence_receipts) ? ledger.evidence_receipts : (ledger.evidence_receipts = []);
  const cleared = [];
  for (const block of VALUE_BLOCKS) {
    const obj = ledger[block];
    if (!obj || typeof obj !== "object") continue;
    for (const [key, value] of Object.entries(obj)) {
      const path = `${block}.${key}`;
      if (typeof value === "string" && STATE_CODE.test(value)) {
        const code = value.trim().toLowerCase();
        obj[key] = "";
        cleared.push(path);
        // A row for "domain_registration.registrant" covers registrant_name
        // and registrant_organization: one sentence, not three.
        const hasRow = receipts.some((row) => {
          const f = String((row && row.field) || "");
          return f && (f === path || f.startsWith(`${path}.`) || path.startsWith(`${f}_`));
        });
        if (!hasRow && code.startsWith("searched_")) {
          receipts.push({ field: path, status: code, finding: reasonFor(code, path), authority: "", source_url: "" });
        }
      } else if (Array.isArray(value) && value.some((v) => typeof v === "string" && STATE_CODE.test(v))) {
        obj[key] = value.filter((v) => !(typeof v === "string" && STATE_CODE.test(v)));
        cleared.push(path);
      }
    }
  }
  return cleared;
}

module.exports = { STATE_CODE, applyRegistryValues, applyNotRegistered, scrubStateCodes };
