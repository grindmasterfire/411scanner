# Bug Investigation — fire's device test 2026-10-14 (night)
**Investigated by:** Muse, on local clone
**For:** Claude Code, morning standup 2026-10-15

---

## 1. Inspect Source triggers APK download — FIXED
**File:** `app/src/main/java/com/fouroneone/scanner/TechnicalEvidenceSection.kt`
**Commit:** 0238652 (local, needs push)

**Root cause:** The `isInspectableTechnicalSource()` function only validated URI scheme
and rejected grounding redirects. It did NOT reject file download URLs. A receipt
carried `https://storage.googleapis.com/scanner-4ea67-apks/main-b2822dc-debug-20261014.apk`
as its `source_url`; tapping "Inspect Source" fired `ACTION_VIEW` on it, triggering
a Chrome download dialog instead of opening a browser.

**Fix applied:** `isInspectableTechnicalSource()` now rejects:
- URLs ending in `.apk`, `.pdf`, `.zip`, `.exe`, `.dmg`, `.msi`, `.aab`
- `storage.googleapis.com` paths containing `scanner-4ea67-apks`

**Still needed:** Find WHY the server put an APK URL in a receipt's `source_url`.
Check `technicalLedgerEvidence.js` grounding resolution — likely a misattributed source.

---

## 2. Background scans return 30101, foreground works
**fire's report:** Background scan notification shows "investigating," drops after 2-3 min,
app shows 30101. Twice. Foreground scan (staying on screen) works fine and fast.

**Investigation:** `ScanWorker.send()` reads from `ScanJobStore.readInput()` and calls
`ScanRepository.submitScan()` with identical parameters as foreground
(`base64Image`, `ocrText`, `adProof`). The request payload is the SAME.

**Conclusion:** This is NOT a client input bug. The 30101 (model skipped live search)
is a server-side Gemini behavior. Possible causes:
- Intermittent model refusal (fire got unlucky twice)
- Background scans hitting the server at a time when Gemini refuses more
- The 6-minute LIVE_WINDOW expiring and the follow-up poll catching a stale/cached 30101

**For Claude:** Check if the 30101 responses have the same requestId as the background
scans. If yes, it's a real model refusal. If the requestIds differ, the Worker might
be polling the wrong request. Also check `ScanRepository.awaitScanResult` timeout logic.

---

## 3. Family invite button does nothing
**fire's report:** Typed email, tapped Invite repeatedly, "didn't see nothing happen."

**Code:** `PlansScreen.kt` line 230-243. Button calls `QuotaRepository.inviteFamilySeat()`
in a coroutine, sets `inviteResult` to "Invited!" or "Invite failed — check the email."

**`inviteFamilySeat` (QuotaRepository.kt:151):** First line is
`val idToken = AuthManager.currentIdToken() ?: return@withContext false`.
If the ID token is null, it silently returns false.

**Likely cause:** fire was testing on a pseudo account. If `currentIdToken()` returns
null (not signed in, token expired), the function returns false immediately. The UI
SHOULD show "Invite failed" in small red text below the button — fire may not have
seen it, or the state update didn't trigger a recomposition.

**For Claude:**
1. Add logging when `currentIdToken()` is null in `inviteFamilySeat`
2. Make the failure message more visible (not small text below the button)
3. Check if `AuthManager.currentIdToken()` is working correctly on pseudo accounts
4. Consider disabling the Invite button with a "sign in required" message if no token

---

## 4. Deep Dive not persistent (Epic 17)
fire opened a Deep Dive, left the screen, came back — report was gone.
Needs: Deep Dive report must survive navigation, retrievable from Recent Scans.
**Not investigated tonight** — needs Claude's Android work.

---

## Summary for push tomorrow
- Commit 0238652: Inspect Source fix (Kotlin, client-side)
- Commit 88159f5: No-unresolved (prompt.js + technicalLedgerEvidence.js) — supersedes the staged `no-unresolved-20261014.patch`, which Claude must NOT apply
- These 4 bug reports for Claude to action
