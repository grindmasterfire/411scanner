/**
 * Red-team fix #6: "verified" on regulatory and consumer rows needs an
 * independent authority, never the company's own (or parent's) site.
 * Run: node tests/independentSourcesTest.js
 */
const assert = require("assert");
const { companyContext, independenceProblem } = require("../technicalLedgerEvidence");

// The real 10/15 Moonlock report: moonlock.com, operator MacPaw Inc.
const moonlock = companyContext({
  solicitation_identity: { operator: "MacPaw Inc.", destination_domain: "moonlock.com" },
  technical_ledger: { attribution: { official_domain: "moonlock.com", operator_name: "MacPaw Inc." } },
});
const own = "https://macpaw.com/moonlock";
for (const f of ["regulatory_record.license_status", "regulatory_record.bbb_record", "regulatory_record.review_spread", "regulatory_record.complaint_pattern", "consumer_evidence.trustpilot"]) {
  assert.equal(independenceProblem(f, own, moonlock), "self-sourced", f);
}

// Ask For Funding: license "verified" by its own homepage.
const aff = companyContext({ solicitation_identity: { operator: "Ecra Ventures LLC", destination_domain: "askforfunding.com" }, technical_ledger: { attribution: { official_domain: "askforfunding.com" } } });
assert.equal(independenceProblem("regulatory_record.license_status", "https://askforfunding.com/", aff), "self-sourced");

// Independent authorities pass.
assert.equal(independenceProblem("regulatory_record.bbb_record", "https://www.bbb.org/us/ca/x/profile/y", moonlock), null);
assert.equal(independenceProblem("consumer_evidence.trustpilot", "https://www.trustpilot.com/review/macpaw.com", moonlock), null, "Trustpilot page about the company is independent");
assert.equal(independenceProblem("regulatory_record.license_status", "https://bizfileonline.sos.ca.gov/search", moonlock), null);
assert.equal(independenceProblem("regulatory_record.license_status", "https://opencorporates.com/companies/us_de/123", moonlock), null);
assert.equal(independenceProblem("regulatory_record.license_status", "https://brokercheck.finra.org/firm/1", aff), null);
assert.equal(independenceProblem("regulatory_record.license_status", "https://rekvizitai.registrucentras.lrv.lt/x", moonlock), null, "foreign government registry");
assert.equal(independenceProblem("regulatory_record.ftc_record", "https://www.ftc.gov/legal-library/case", moonlock), null);
assert.equal(independenceProblem("regulatory_record.ftc_record", "https://www.courtlistener.com/docket/1", moonlock), null);
assert.equal(independenceProblem("regulatory_record.review_spread", "https://www.reddit.com/r/mac/comments/1", moonlock), null);

// Right kind of site, wrong authority for the row.
assert.equal(independenceProblem("regulatory_record.bbb_record", "https://www.reddit.com/r/x", moonlock), "not-the-authority");
assert.equal(independenceProblem("consumer_evidence.trustpilot", "https://www.sitejabber.com/x", moonlock), "not-the-authority");
assert.equal(independenceProblem("regulatory_record.license_status", "https://www.linkedin.com/company/x", moonlock), "not-the-authority");

// Other rows are untouched (attribution may cite the company's own site).
assert.equal(independenceProblem("attribution.official_domain", own, moonlock), null);
assert.equal(independenceProblem("attribution.business_addresses", own, moonlock), null);
const gc = companyContext({ solicitation_identity: { operator: "Good Call Music" }, technical_ledger: { attribution: { official_domain: "goodcallmusic.com" } } });
assert.equal(independenceProblem("regulatory_record.review_spread", "https://www.musicbusinessworldwide.com/x", gc), null, "a generic word in the name doesn't make a site the company's");
assert.equal(independenceProblem("regulatory_record.review_spread", "https://goodcallmusic.com/reviews", gc), "self-sourced");
// Operator site variants: macpawhq.com counts, but a long unrelated name doesn't.
assert.equal(independenceProblem("regulatory_record.bbb_record", "https://macpawhq.com/about", moonlock), "self-sourced");
console.log("independentSourcesTest: all passed");
// Official state registries off .gov (AdventHealth via sunbiz.org, 10/15).
for (const u of ["https://search.sunbiz.org/Inquiry/x", "https://dos.myflorida.com/sunbiz/", "https://www.myfloridalicense.com/x", "https://sos.state.nv.us/x", "https://www.sos.state.tx.us/corp"]) {
  assert.equal(independenceProblem("regulatory_record.license_status", u, moonlock), null, u);
}
assert.equal(independenceProblem("regulatory_record.license_status", "https://www.statefarm.com/x", moonlock), "not-the-authority");
console.log("independentSourcesTest: state registries passed");
