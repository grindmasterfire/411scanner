---
title: 411 Scanner — User Manual
---

*Version 1.0 — October 2026*

---

## 1. What 411 Scanner Does

411 Scanner investigates the suspicious things that land in front of you: ads in your feed, texts, emails, flyers, websites, app listings, and offers that sound too good to be true. You give it a screenshot or a photo. It researches the source live on the web, measures the website behind it, and gives you a plain-language report with a score and a recommended action.

The report has three parts:

- **The 411:** the score, what to do, and the short story of what this is.
- **The Technical 411:** the evidence ledger: who runs it, where it lives on the internet, what the regulators and reviewers say. Every row says what we found, or exactly why we couldn't find it, and links to a source you can open yourself.
- **Alternatives:** for anything risky, legitimate options worth looking at instead.

---

## 2. How to Scan

1. **Open the app.** You can start as a guest for your free weekly scan; sign in with Google to subscribe, buy top-ups, or join a family.
2. **Add the specimen.** Take a screenshot or a photo of the ad, message, email, flyer, or page, and put it in the scanner tray. You can also share an image straight into 411 Scanner from another app.
3. **Free users:** watch one short ad all the way through. The completed ad is what pays for your free scan.
4. **Confirm.** The app asks *"Scan this specimen?"* and tells you what it will use (your free scan, a plan scan, or a top-up). Nothing is charged until you tap **Scan**. If you added the wrong picture, cancel.
5. **Go about your day.** The scan runs on our servers. You'll see *"Investigating…"* in your notifications, and *"Your 411 on … is ready"* when the report lands. Tap it to open the report. You can close the app, take a call, or lock your phone; the scan keeps going.

**Every scan attempt counts.** Once you confirm, the scan uses a credit even if the investigation can't finish (for example, if nothing in the image identifies what is being offered). This protects the service from people trying to run free investigations by forcing failures.

**Email screenshots** are welcome: a screenshot of a single email is scanned as a solicitation. We read the sender from the screenshot itself. Links in your mail app's own ads (for example, inbox ads around the message) are not treated as part of the email.

---

## 3. Reading Your Score: the Action Meter

Every report has a score and an action. A low score is good news. A high score is the scanner doing its job.

| Score | Action | What it means |
|---|---|---|
| **0.0 – 2.9** | **EVERYBODY** — use it | A legitimate offer with nothing material against it. Ordinary care applies. |
| **3.0 – 4.9** | **MOSTLY EVERYBODY** — generally fine | Legitimate, with minor costs, ads, data collection, or fine print worth knowing. |
| **5.0 – 5.5** | **TRIBE** — specialized audience | Real, but built for a particular group. Know what you're joining. |
| **5.6 – 5.9** | **TRIBE + KNOWLEDGE** — understand the mechanics | Real, but you need to understand how it works before you put time or money in. |
| **6.0 – 6.9** | **NOT FOR EVERYONE** — don't enter casually | Meaningful risk, cost, or complexity. Read everything first. |
| **7.0 – 7.9** | **PROFESSIONAL CONSIDERATION ONLY** | Legal, but the risk or complexity calls for professional-level understanding. |
| **8.0 – 8.4** | **DELETE FROM DEVICE** — remove it | Deception, a hidden burden an ordinary person can't manage, or a validated warning sign. Don't engage. |
| **8.5 – 8.9** | **DELETE FROM DEVICE AND REPORT** | Remove it, and report it. The Report button appears from 8.5. |
| **9.0 – 9.9** | **REPORT TO PLATFORM** | The platform or the authorities need to act. Report it. |
| **10.0 and up** | **DELETE FROM EARTH** | Dangerous: malware, extortion, criminal operations. Scores can go above 10 and are shown as they are. |

**What else the score unlocks:**

- **5.5 and below:** the report includes **verified contact information for the real source**: the official website, phone, and email, so you can reach the genuine company directly.
- **5.6 and above:** the report shines a **fog light**: three to five legitimate alternatives (comparable, complementary, or adjacent options) worth looking at instead.
- **8.5 and above:** the **Report** button appears (see Section 7).

**How the score is built.** The AI weighs six measures (Financial Risk, Personal Data Exposure, Wasted Time & Ads, Real Substance, Practical Utility, and Honest Business Model) against the evidence it found. The server then applies fixed rules the AI can't override: the AI alone can never push a score to 8.0 or above. That takes either evidence that an ordinary person can't manage the risk, or a validated warning sign (a "floor raiser") such as advance fees, impersonation, credential theft, a documented rebrand to escape complaints, or extortion. Each floor raiser must come with its evidence or the server rejects it.

### Scores "with an exception"

A few entities carry a fixed score set by people, not by the scan. The report shows the score with the words **"with an exception"**, and every finding in the report still stands in full. Exceptions are never offered to an impersonator: if the scan finds signs it isn't the real entity, the exception doesn't apply.

- **Dun & Bradstreet (myD&B): 7.9, Professional consideration only.** D&B is required business infrastructure: D-U-N-S numbers are used for business verification, credit, and contracting, and some platforms require one. The report keeps every finding, including the FTC's 2022 order and the 2025 $5.7 million settlement. Deal with it professionally: read renewal terms and sales claims carefully and keep records.
- **Universal AdCom (UAC 4u / UAC4U): 8.4, Delete from device.** UAC sells advertising on maps, magnets, bookmarks, and similar items. Its current record (an F rating at the BBB and complaints of unauthorized invoices sent to collections) puts it at the top of Delete from Device: be ready to report it on a moment's notice. Police, sheriffs, and chambers of commerce have warned since at least 2008 that its salespeople claimed partnerships that weren't real; the most recent (Baker County, Florida Sheriff's Office, July 2025) is disputed by the company and unresolved. Disputed history is shown in the findings with dates and both sides; it doesn't add points. If an impersonation claim is ever decided against the company (a court, a regulator, an attorney general), the scanner applies it at full weight immediately. Never agree to anything by phone, and confirm any claimed partnership directly with the organization named.

---

## 4. The Technical 411: How the Ledger Is Built

The Technical 411 is the evidence behind the score. It comes from two places:

1. **Our own measurements (the Network Probe).** When the specimen points to a website, our server visits the domain directly and records what it measures: its IP addresses, the network it lives on, its security certificate, its mail servers and email-security records, tracking IDs, subdomains, hosting, and the domain registry record (registrar, registration dates, owner). These rows are labeled with where they came from, and you can check each one yourself.
2. **Live research.** The AI searches the web during your scan (Google Search) for who operates it, where it's registered, and what the BBB, the FTC, Trustpilot, consumer complaint sites, and license registries say.

### The 23 rows

Every full report covers these 23 questions. Each row either answers it, or tells you exactly why it couldn't be answered.

| # | Row | What it answers |
|---|---|---|
| 1 | Operator | Who runs it |
| 2 | Official website | Its real web address |
| 3 | Business address | Where it is, as found in business records |
| 4 | Registrar | The company the domain is registered through |
| 5 | Registrant | Who owns the domain, if public |
| 6 | IP addresses | Where the site's servers are |
| 7 | ASN | The network that carries the site |
| 8 | TLS certificate | Who issued the site's security certificate |
| 9 | Mail servers | Where its email is handled |
| 10 | DMARC / SPF | Whether its email is protected against forgery |
| 11 | Tracking IDs | Analytics and ad-tracking tags on the site |
| 12 | Subdomains | Other names under the same domain |
| 13 | Hosting provider | The company hosting the site |
| 14 | CDN | The content-delivery network in front of it |
| 15 | License / registration | Business filings and any license the activity needs |
| 16 | BBB record | Better Business Bureau profile and rating |
| 17 | FTC record | Federal Trade Commission enforcement |
| 18 | Review spread | What customers say across review sites |
| 19 | Withdrawal terms | Can you get your money out, and on what terms |
| 20 | Complaint pattern | Recurring complaints and their themes |
| 21 | Trustpilot | Rating, review count, and recurring themes |
| 22 | Affiliate disclosure | Whether it discloses paid promotion |
| 23 | Guarantee terms | Refund or guarantee terms |

### Why some rows don't appear on every report

The scanner only runs a lookup where it means something:

- **No website, no network rows.** A flyer with only a phone number has no IP addresses, certificate, or mail servers to measure. A report won't invent them.
- **App-store listings.** Google Play and the App Store are platforms, not the developer. We measure the developer's own website, not Google's.
- **Impersonations.** When a specimen fakes a brand (for example, a phishing email dressed as Stripe), we never measure the real brand's website and show it as if it belonged to the scammer. We measure the scammer's own addresses instead.
- **Email screenshots.** Links in your mail app's ads aren't part of the email, so they aren't measured.
- **Not applicable.** Some rows don't apply (for example, withdrawal terms for an app that never holds your money). The row says so.

### What each status means

| Status | Meaning |
|---|---|
| **Verified** | A source you can open establishes it. |
| **Searched, no record** | We searched the named sources and nothing exists there. |
| **Searched, redacted** | The record exists but is privacy-protected (usually the domain owner). The row says where the fact is found instead. |
| **Searched, behind paywall** | The record exists behind a paywall or login. |
| **Searched, deleted** | It existed and was taken down. |
| **Searched, record corrupted** | It exists but is broken or unreadable. |
| **Searched, sources conflict** | Sources disagree and none settles it. |
| **Searched, too new** | The target is too new to have this record yet. That itself is a signal. |
| **Searched, needs official request** | It exists but requires an official request or offline access. |
| **Searched, site blocked us** | The site's bot protection blocked our scanner. |
| **Found, not confirmed** | Something was reported, but no live source we can open confirms it. It is shown, marked as unconfirmed, never as fact. |

We never sell you "redacted" as an answer. If we can't fill a row, the row tells you what we checked, why it came up empty, and where the fact can be found instead. A domain that isn't registered at all is reported as exactly that: the address on the specimen leads nowhere.

### Plain-language glossary

- **Grounding (live research):** the AI must back its findings with live Google Search results during your scan, not its memory. Scans whose research can't be verified against live sources are rejected (codes 30101–30103).
- **Domain / registrar / registrant:** a domain is the web address (example.com). The registrar is the company it was bought through. The registrant is the owner, often hidden by a privacy service.
- **WHOIS / RDAP:** the public registry lookup for a domain. RDAP is the modern version. Registration dates are always public; owners often aren't.
- **DNS A / AAAA records:** the internet's phone book entries that point a domain at its servers (IPv4 and IPv6 addresses).
- **IP address:** the numeric address of a server.
- **ASN (Autonomous System Number):** the network that carries a server's traffic, usually a hosting company or an internet provider.
- **TLS certificate:** what puts the padlock in your browser. Who issued it, and whether it's valid, expired, or mismatched, is measured.
- **CDN (content-delivery network):** a service (Cloudflare, for example) that sits in front of a site. It can hide where the site really lives.
- **MX records:** where a domain's email is delivered.
- **SPF / DKIM / DMARC:** email-security records that tell receivers which servers may send mail for a domain, and what to do with forgeries. A domain without them is easier to impersonate.
- **Tracking IDs:** analytics and advertising tags (such as Google Analytics) that can link one site to others run by the same people.
- **Subdomains:** other names under the same domain (shop.example.com), which can reveal related operations.

---

## 5. Working the Findings: the Inspect Source Links

Every verified row links to its source. Tap **Inspect Source** to open the page the finding came from: the BBB profile, the FTC case, the registry lookup, the review page.

**We show you the record and take you to it. The comparing is your part.** That is deliberate: a report you can check is worth more than one you have to trust. Here's how to work it:

1. **Open the source.** Make sure it says what the row says, about the same company and the same website.
2. **Compare names and addresses.** Does the operator on the business filing match the name on the ad? Does the website's registrant country match where the company says it is?
3. **Check the dates.** A domain registered last month selling a "20-year-old company" is a finding. So is a BBB profile with a burst of complaints this year.
4. **Search the company yourself.** Use the official website and phone from the report, not the ones in the ad, to reach the real company.
5. **Read "Found, not confirmed" rows as leads, not facts.**

---

## 6. Deep Dive

The base scan answers *"Is this risky?"* A Deep Dive answers *"What do I do about it?"* It is a focused follow-up investigation of **one finding** from your report, not a re-scan.

- Tap **Would You Like To Know More?** under the report. The button shows how many top-up credits you have left.
- The app asks before spending: *"You have N top-up credits. This Deep Dive uses 1, leaving N-1. Are you sure?"* Nothing is charged until you tap **Run**.
- The Deep Dive runs on our servers in the background. You'll be notified when it's ready; tap the notification to open the report.
- The Deep Dive picks the highest-risk finding in your report (a validated warning sign first, then the weakest of the six measures) and investigates only that, with fresh live research. It's written in four sections: **The Finding, The Investigation, The Timeline, Your Options**, followed by **Sources** taken directly from the search results.
- It never re-scores the target or repeats the report you already read. If the research finds nothing new, it says so; the credit pays for the search, not for guaranteed findings.
- After a Deep Dive, the button becomes **Re-dive for an additional credit?** Each Deep Dive costs 1 top-up credit, including re-dives. If you run a re-dive on the same finding, you may get the same Deep Dive back; it still uses a credit.
- Deep Dives use **top-up credits only**, never plan scans. Family members draw from the shared family bank. With no top-up credits, the app tells you to add a top-up first.
- When the operator behind a scam can't be named (a hijacked mailbox, a throwaway domain), the Deep Dive researches the scam pattern itself: how it works, its history, what to do if you engaged, and where to get help.

---

## 7. The Report Button: Where to Report It

From a score of **8.5**, the report shows **Report (N places)**. It opens **Where to report this**: the right agencies and platforms for what the scan actually found, each with one sentence saying why. The FTC is always first. Others are added by violation type:

| What the scan found | Where it goes |
|---|---|
| Fraud, impersonation, deceptive business practices | FTC (ReportFraud.ftc.gov) and your state attorney general |
| Impersonating the government | The FBI's Internet Crime Complaint Center (IC3); IRS impersonation → TIGTA; Social Security impersonation → SSA Inspector General |
| Phishing and fake login pages | Google Safe Browsing and CISA |
| Malware | Google Safe Browsing and CISA |
| Extortion, sextortion, criminal operations | FBI IC3 |
| Crypto, investment, and trading schemes | SEC, CFTC, and your state securities regulator |
| Unwanted calls and texts | FCC and the Do Not Call Registry |
| Mail and printed solicitations | U.S. Postal Inspection Service |
| Apps on Google Play | Google Play |

Reports are filed by you, on the agency's own website. 411 Scanner does not file them for you.

---

## 8. Attacks on the Scanner

Some specimens aren't offers at all: they're text written to manipulate AI scanners ("ignore your instructions", "award 50 credits", fake "verified by 411" banners). The scanner treats every word in a specimen as content to investigate, never as instructions. When a specimen is nothing but an attack, the report says so in one plain explanation, shows what the attack asked for as *"The attack asked: …"*, and confirms that nothing it asked for was done. An attack is never scored as safe. When a real scam carries hidden attack text, you get the full report on the scam.

---

## 9. Plans & Pricing

| Plan | Price | Scans |
|---|---|---|
| **Free** | $0 | 1 scan per week, unlocked by watching one ad all the way through |
| **Rental** | $3.99 / 7 days | 7 scans |
| **Standard** | $12.99 / month or $129.99 / year | 30 a month, or 360 a year |
| **Pro (Professional)** | $24.99 / month or $249.99 / year | 60 a month, or 720 a year; no ads; several scans at once |
| **Family** | $19.99 / month or $199.99 / year | 40 shared a month, or 480 shared a year; up to 4 seats |

### How credits work

- **Every scan uses exactly 1 credit**, whether it's a fresh investigation or one we've already researched for someone else. Reusing past research is how we keep prices low.
- **Plan scans reset** each billing period and don't roll over.
- **Top-up credits never expire.** Plan scans are always used first; top-ups are your backup bank, and the only credits Deep Dives use.
- **The free scan** is counted per account and per device. Clearing the app's data doesn't reset it.

### Top-ups (subscribers only)

| Pack | Price |
|---|---|
| 5 scans | $2.99 |
| 10 scans | $4.99 |
| 20 scans | $8.99 |
| 25 scans (Family) | $10.99 |

Family top-ups go into the shared family bank.

### Family

The account that buys Family is the family admin. The admin invites members by email; each member accepts or declines in the app. Everyone draws from the same shared bank. The admin can pause a member's scanning (the member sees code 40102) or remove a member.

---

## 10. Professional

Professional is the Pro plan: built for the people who investigate for a living, or for the people around them.

**Several scans at once.** On every other plan, a new scan replaces the one in flight. Professional runs several side by side: each has its own background job, its own *"Investigating…"* notification, and its own *"ready"* notification that opens that scan's report.

**No commercials.** Professional work is evidentiary work. An advertisement inside an investigation would compromise the neutrality of that work, so Professional scans run without ads.

**Field guide:**

- **The investigator:** scan every specimen in a case as it comes in; they run in parallel. Use Inspect Source to build your own file from the primary records, and Deep Dive the one finding that matters to the case.
- **The researcher:** compare campaigns. The Technical 411 (registrars, hosting networks, tracking IDs, mail servers) is where related operations show their connections.
- **The developer:** check vendors, SDKs, partners, and the apps your users ask about. The registry, certificate, and email-security rows tell you how seriously a company runs its infrastructure.
- **The diligent web citizen:** scan what reaches your family, your congregation, your neighborhood group. At 8.5 and above, report it: the Report button tells you where.

---

## 11. Ads

Ads pay for the free weekly scan and keep subscription prices down.

- **Free plan:** one rewarded ad plays before your scan and must finish. No completed ad, no free scan. The server verifies the completed ad with Google before the scan runs.
- **Rental, Standard, and Family:** an ad plays before the scan.
- **Professional:** no ads.

---

## 12. If Something Goes Wrong: Error Codes

When a scan can't finish, you'll see a plain-language explanation and a **5-digit reference code**. Quote the code if you contact support.

**1xxxx — Connection (your phone couldn't reach us)**
- **10101** — Your phone isn't connected to the internet.
- **10102** — The connection dropped while sending your scan. The app resends it safely; a scan is never run or charged twice.

**2xxxx — The scanner (our servers)**
- **20101** — The scanner was still warming up. Try again in a moment.
- **20102** — The scanner is busy. Try again shortly.
- **20201** — The scanner hit an unexpected problem. It's logged.
- **20301** — The investigation took too long and timed out.

**3xxxx — Live research**
- **30101** — Our research AI skipped its live web search. That's on our end.
- **30102** — We searched the live web but found nothing solid on this target.
- **30103** — The investigation couldn't be verified against live sources.
- **30201** — Our safety systems blocked this investigation.

**4xxxx — Scans and billing**
- **40101** — You're out of scans on this plan. Top up or upgrade.
- **40102** — Your family admin has paused scanning for your account.
- **40201** — Deep Dives need a top-up credit.
- **40301** — We couldn't verify that purchase. If you were charged, contact support.

**5xxxx — Your submission**
- **50101** — That doesn't look like a link we can scan.
- **50102** — We couldn't identify what this solicitation is for, so there was nothing to investigate. The attempt counts.
- **50201** — The image is too large. Try a smaller one.

**6xxxx — Free scan and ads**
- **60101** — You've used this week's free scan.
- **60102** — The ad didn't finish playing, or took too long to be confirmed. Watch it all the way through.

**7xxxx — Deep Dive**
- **70101** — The Deep Dive couldn't finish.

**8xxxx — Sign-in**
- **80101** — Your sign-in expired. Sign in again.

**9xxxx — Unknown**
- **90101** — Something unexpected happened. It's logged.

---

## 13. Managing Your Subscription

- Upgrade, downgrade, or cancel in the Google Play Store: Play Store → profile → Payments & subscriptions → Subscriptions.
- Canceling stops future billing; your plan scans remain until the end of the current period.
- Top-up credits stay yours after you cancel.
- Refunds follow Google Play's refund policy.

---

## 14. Your Privacy

The short version (the full Privacy Statement has the details):

- The screenshot you scan, the text read from it, and the report are stored so we can investigate, keep a record of every scan, and recognize repeat scams faster. Screenshots are kept for 90 days; scan records for one year. Only the owner of 411 Scanner can access them.
- We don't sell your personal information.
- Google handles your sign-in; we never see your password.
- To delete your account and data, email us from the account's address.

---

## 15. Support

Email **grindmasterfire@gmail.com** with the **5-digit reference code** if you have one.

---

*411 Scanner is a research tool, not legal, financial, or security advice. Scores reflect the best available intelligence at scan time. Always use your own judgment before sending money, sharing information, or installing software.*
