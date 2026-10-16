---
title: 411 Scanner — Privacy Statement
---

*Last updated: October 16, 2026*

*This is a plain-language statement of our data practices, used for the Google Play privacy policy listing. It is not legal advice. Have an attorney review before publishing.*

---

## 1. Overview

411 Scanner investigates suspicious content you submit and returns a research report. This statement explains what we collect, why, how long we keep it, who can see it, and your choices.

Publisher: **Cipherworks Dev Cottage**. Contact: **grindmasterfire@gmail.com**

## 2. What We Collect

**What you give us**

- **The specimen:** the screenshot or photo you scan, and the text your phone reads from it on your device before sending (OCR text). Specimens often contain other people's names, phone numbers, email addresses, or account details, because that is what scams contain. Please crop out anything you don't need scanned.
- **Account information:** if you sign in with Google, your Google account identifier, email address, and display name (provided by Google; we never see your password). Guest sessions use an anonymous identifier.
- **Family invitations:** the email address of anyone you invite to your Family plan.

**What we collect automatically**

- **Scan records:** each scan's request ID, time, plan, whether a credit was used, the investigation's steps, and its outcome, including error codes.
- **Device key for the free scan:** a one-way hash of your device's Android ID, hashed again on our server, so the free weekly scan is counted per device as well as per account. We can't recover the Android ID from it.
- **Ad verification:** a confirmation from Google AdMob that a rewarded ad finished, before a free scan runs. AdMob may use your device's advertising identifier under its own privacy policy.
- **Purchases:** Google Play order identifiers and product IDs, verified with Google, and tied to your account with a one-way identifier. We never see or store your payment details.
- **Diagnostics in test builds only:** pre-release test builds upload technical logs to help us fix problems. Store versions don't.

## 3. How We Use It

- **To run the investigation:** your specimen and its text are sent to Google's Gemini AI models, which research it live with Google Search. Our server measures any website the specimen points to (its registry record, servers, certificate, and email-security records).
- **To keep a complete record of every scan (the Incident Ledger):** we store the specimen, the text read from it, every AI request and response, the sources found, and the final report. This lets us answer questions about any scan, investigate errors and attacks, and stand behind every report.
- **To recognize repeat scams (the Cache Bank):** a finished report is stored against a fingerprint of the image and reused when someone scans the same specimen, so a scam researched once protects the next person faster. A reused report is refreshed after 14 to 120 days, depending on how fast that kind of target changes.
- **To deliver your result:** your report is held on our server for 24 hours so the app can collect it after you leave the app. Background Deep Dive requests are held for 24 hours on the same basis.
- **To enforce credits, plans, ads, and families**, and to prevent abuse.
- **To operate and improve the service:** reliability, costs, and detection quality.

We **do not sell** your personal information, and we don't use your specimens for advertising.

## 4. How Long We Keep It

| Data | Kept for |
|---|---|
| Specimen images (Incident Ledger) | 90 days, then deleted automatically |
| Scan records: text read from the specimen, AI requests and responses, sources, report | 1 year, then deleted automatically |
| Report held for delivery to your phone | 24 hours |
| Background Deep Dive requests | 24 hours |
| Cache Bank reports (research reused for repeat specimens) | Kept as research history; reused for 14 to 120 days before being refreshed |
| Account, plan, credit, purchase, and family records | While your account exists, and as required for accounting and legal purposes |
| Free-scan device key | While needed to count the weekly free scan |

## 5. Who Can See It

- **The owner of 411 Scanner only.** Specimens and scan records are kept in private storage that only the owner's account and the scanner service itself can reach. Public access is blocked.
- **Service providers that run the service for us:** Google Cloud and Firebase (hosting, sign-in, storage), Google Gemini and Google Search (the research), Google AdMob (ads), and Google Play (billing). The Network Probe queries public registry and internet services (domain registries, DNS) about the website in a specimen, not about you.
- **Authorities:** only when the law requires it.

We don't share your specimens or personal data with data brokers, marketers, or unrelated third parties.

## 6. Your Choices and Rights

- **Access or correction:** email us for a copy of your data or to correct it.
- **Deletion:** email **grindmasterfire@gmail.com** from the address on your account and we'll delete your account and the scan records tied to it. Cache Bank reports, which hold research about the specimen and not your account, may be kept.
- **Ads:** use your device's ad settings to limit ad personalization. The free plan still shows a rewarded ad.
- **Crop before you scan** if a specimen contains information you'd rather not send.

## 7. Children

411 Scanner is not directed at children under 13, and we don't knowingly collect their information. If you believe a child has given us data, contact us and we'll delete it.

## 8. Security

Data travels encrypted. Access to stored data is restricted to the owner and the services that need it. The AI key that runs the investigations is kept in Google Secret Manager. No system is perfectly secure, and we can't guarantee absolute security.

## 9. Changes

We'll update this statement as the service changes, and announce material changes in the app or at our contact address.

## 10. Contact

Privacy questions or requests: **grindmasterfire@gmail.com**
