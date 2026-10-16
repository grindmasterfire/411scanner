/**
 * @file functions/reportDestinations.js
 * @class Class 1 (Focused Logic Component)
 * @cap 160 Lines
 * @responsibility The Report button's doors: from what the report actually
 *   found (accepted floor raisers, channel, solicitation type, badges), the
 *   agencies and platforms where this violation gets reported, each with
 *   one plain sentence saying why that door.
 * @dependencies ./actionMeterFloorRaisers
 * @security_gate Fixed, vetted destinations only (official agency and
 *   platform reporting pages). Never a URL from the report or the model.
 * @owner_context fire 2026-10-16: "'Report to platform' without a
 *   destination isn't actionable. Impersonation/fraud → FTC + state AG. Map
 *   the other violation types to their doors the same way."
 *
 * Shown only where the app shows the Report button (final score 8.5+).
 */

const { extractFloorRaisers } = require("./actionMeterFloorRaisers");

const DOORS = {
  ftc: { label: "Report to the FTC", url: "https://reportfraud.ftc.gov/", why: "The Federal Trade Commission collects fraud and deceptive-business reports nationwide." },
  state_ag: { label: "Report to your state attorney general", url: "https://www.naag.org/find-my-ag/", why: "Your state attorney general enforces consumer-protection law where you live." },
  ic3: { label: "Report to the FBI (IC3)", url: "https://www.ic3.gov/", why: "The FBI's Internet Crime Complaint Center takes online fraud, extortion, and impersonation of government." },
  safe_browsing_phish: { label: "Report the phishing page to Google", url: "https://safebrowsing.google.com/safebrowsing/report_phish/", why: "Google Safe Browsing warns Chrome, Android, and other browsers away from the page." },
  safe_browsing_malware: { label: "Report the malware site to Google", url: "https://safebrowsing.google.com/safebrowsing/report_badware/", why: "Google Safe Browsing blocks sites that spread malware." },
  cisa: { label: "Report to CISA", url: "https://www.cisa.gov/report", why: "The Cybersecurity and Infrastructure Security Agency tracks phishing and malware campaigns." },
  sec: { label: "Report to the SEC", url: "https://www.sec.gov/tcr", why: "The SEC handles investment and securities fraud, including crypto investment schemes." },
  cftc: { label: "Report to the CFTC", url: "https://www.cftc.gov/complaint", why: "The CFTC handles commodity, forex, and crypto trading fraud." },
  state_securities: { label: "Report to your state securities regulator", url: "https://www.nasaa.org/contact-your-regulator/", why: "State securities regulators police unregistered investment offers." },
  fcc: { label: "Report to the FCC", url: "https://consumercomplaints.fcc.gov/", why: "The FCC takes complaints about unwanted calls, robocalls, and texts." },
  donotcall: { label: "Report to the Do Not Call Registry", url: "https://www.donotcall.gov/report.html", why: "The FTC's Do Not Call Registry records illegal sales calls." },
  uspis: { label: "Report to the U.S. Postal Inspection Service", url: "https://www.uspis.gov/report", why: "Postal Inspectors investigate fraud sent by mail and printed solicitations." },
  google_play: { label: "Report to Google Play", url: "https://support.google.com/googleplay/answer/2853570", why: "Google Play reviews and removes apps that violate its policies." },
  tigta: { label: "Report IRS impersonation (TIGTA)", url: "https://www.tigta.gov/reportcrime-misconduct", why: "TIGTA investigates people impersonating the IRS." },
  ssa_oig: { label: "Report Social Security impersonation", url: "https://oig.ssa.gov/", why: "The SSA Inspector General investigates Social Security impersonation scams." },
};

const MAX_DOORS = 5;

function text(report) {
  const card = report.consumer_card || {};
  const identity = report.solicitation_identity || {};
  const pattern = report.solicitation_pattern || {};
  return [
    card.target_name, card.interface_surface, ...(card.classification_badges || []),
    identity.canonical_name, identity.channel, identity.offer_mechanic,
    pattern.solicitation_type, pattern.offer_or_request, ...(pattern.behavioral_signals || []),
  ].join(" ").toLowerCase();
}

/**
 * The ordered doors for this report: [{ id, label, url, why }]. The FTC is
 * always first; the rest follow what the report found.
 */
function reportDestinations(report) {
  if (!report || !report.consumer_card) return [];
  const r = extractFloorRaisers(report);
  const t = text(report);
  const channel = String((report.solicitation_identity || {}).channel || "").toLowerCase();
  const surface = String(report.consumer_card.interface_surface || "").toLowerCase();
  const ids = ["ftc"];
  const add = (...more) => more.forEach((id) => { if (!ids.includes(id)) ids.push(id); });

  // Government impersonation: the impersonated agency's own watchdog first.
  if (r.federalImpersonation) {
    if (/\birs\b|internal revenue/.test(t)) add("tigta");
    if (/social security|\bssa\b/.test(t)) add("ssa_oig");
    add("ic3");
  }
  // Fraud and deception by a business: the state attorney general.
  if (r.brandImpersonation || r.federalImpersonation || r.advanceFee || r.withdrawalGate ||
      r.subscriptionDarkPatterns || r.recruitmentGatedEarnings || r.dataBrokerage || r.ipHostageLockIn ||
      /fraud|deceptive|unauthori[sz]ed (billing|invoice|charge)|scam/.test(t)) {
    add("state_ag");
  }
  // Credential theft and phishing pages.
  if (r.credentialHarvesting || /phish|credential|fake login|account verification/.test(t)) add("safe_browsing_phish", "cisa");
  if (/malware|trojan|ransomware|spyware|malicious (app|download|file)/.test(t)) add("safe_browsing_malware", "cisa");
  // Crimes and extortion.
  if (r.extortionMechanics || r.confirmedCriminal || /extortion|sextortion|blackmail/.test(t)) add("ic3");
  // Investment, securities, crypto trading.
  if (/crypto|bitcoin|token|presale|airdrop|forex|trading|investment|securities|ponzi|pyramid/.test(t)) add("sec", "cftc", "state_securities");
  // Calls and texts.
  if (channel === "phone" || channel === "sms" || /robocall|telemarket|cold call|text message|\bsms\b/.test(t)) add("fcc", "donotcall");
  // Mail and print.
  if (channel === "print" || channel === "mail" || /\bmail(ed|er)?\b|postcard|flyer|letter/.test(t)) add("uspis");
  // App stores.
  if (surface.includes("play.google.com") || /android app|play store/.test(t)) add("google_play");

  return ids.slice(0, MAX_DOORS).map((id) => ({ id, ...DOORS[id] }));
}

/** Attach the doors to a delivered report's consumer card (cached ones too). */
function applyReportDestinations(report) {
  if (!report || !report.consumer_card) return [];
  const doors = reportDestinations(report);
  report.consumer_card.report_destinations = doors;
  return doors.map((d) => d.id);
}

module.exports = { DOORS, MAX_DOORS, reportDestinations, applyReportDestinations };
