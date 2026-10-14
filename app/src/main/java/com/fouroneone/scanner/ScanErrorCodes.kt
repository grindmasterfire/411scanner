package com.fouroneone.scanner

import java.io.IOException

/**
 * Canonical 5-digit scan failure taxonomy (locked 2026-10-07).
 *
 * Users NEVER see raw HTTP codes. Every failure surfaces as a 5-digit code
 * plus one plain-language sentence. Mirrors functions/scanErrorCodes.js —
 * keep the two tables in sync.
 *
 * Digit scheme: F-AA-SS — F = family, AA = area, SS = specific error.
 */
object ScanErrorCodes {

    const val FALLBACK_CODE = "90101"

    private val MESSAGES = mapOf(
        "10101" to "Your phone isn't connected to the internet. Check your connection and try again.",
        "10102" to "The connection dropped while sending your scan. Try again.",
        "20101" to "The scanner was still warming up. Wait a moment and try again.",
        "20102" to "The scanner is busy right now. Try again shortly.",
        "20201" to "The scanner hit an unexpected problem on our end. We've logged it \u2014 try again.",
        "20301" to "The investigation took too long and timed out. Try again.",
        // 30101-30103 split by grounding cause (approved 2026-10-14).
        "30101" to "Our research AI skipped its live web search on this one \u2014 that's on our end.",
        "30102" to "We searched the live web but couldn't find anything solid on this target.",
        "30103" to "The investigation couldn't be verified against live sources.",
        "30201" to "Our safety systems blocked this investigation.",
        "40101" to "You're out of scans on this plan. Top up or upgrade to keep going.",
        "40102" to "Your family admin has paused scanning for your account.",
        "40201" to "Deep dives need a top-up credit. Pick up a top-up pack to unlock this.",
        "40301" to "We couldn't verify that purchase. If you were charged, contact support.",
        "50101" to "That doesn't look like a link we can scan. Check it and try again.",
        "50102" to "We couldn't identify what this solicitation is for, so there was nothing to investigate. This attempt was counted against your quota.",
        "50201" to "That image is too large to scan. Try a smaller one.",
        "60101" to "You've used this week's free scan. Come back next week, or pick a plan.",
        "60102" to "The ad didn't finish playing. Watch it all the way through to run your scan.",
        "70101" to "The deep dive ran into a problem. Try again.",
        "80101" to "Your sign-in expired. Sign in again to continue.",
        "90101" to "Something unexpected happened. We've logged it \u2014 try again."
    )

    fun messageFor(code5: String): String = MESSAGES[code5] ?: MESSAGES[FALLBACK_CODE]!!

    /** Map an HTTP status to the user-facing 5-digit code. */
    fun forHttpStatus(status: Int): String = when (status) {
        400 -> "50101"
        401, 403 -> "80101"
        404 -> "20201"
        413 -> "50201"
        429 -> "20102"
        500 -> "20201"
        502, 503 -> "20101"
        504 -> "20301"
        else -> FALLBACK_CODE
    }

    /**
     * Build the failure for an unsuccessful callable response. The server's
     * own code5 (error.details.code5) and message win: they say what
     * actually happened (out of scans, no verified ad, no target), which the
     * HTTP status alone cannot. Falls back to the status mapping.
     */
    fun fromCallableError(status: Int, body: String?): ScanFailureException {
        var code5: String? = null
        var serverMessage: String? = null
        var inProgress = false
        try {
            val error = body?.let { org.json.JSONObject(it).optJSONObject("error") }
            val details = error?.optJSONObject("details")
            // A resend of a scan the server is still running: keep following.
            inProgress = details?.optBoolean("inProgress") == true
            code5 = details?.optString("code5")
                ?.takeIf { MESSAGES.containsKey(it) }
            serverMessage = error?.optString("message")?.takeIf { it.isNotBlank() }
        } catch (_: Exception) {
            // Non-JSON body: fall through to the HTTP mapping.
        }
        val resolved = code5 ?: forHttpStatus(status)
        // Server messages are only trusted alongside a server code5;
        // otherwise raw framework text ("INTERNAL") could leak through.
        val message = if (code5 != null && serverMessage != null) serverMessage
            else messageFor(resolved)
        // A 5xx with no server code5 came from the infrastructure (gateway
        // timeout, crash before the handler answered), not from the scan:
        // the scan may still finish and land in scan_results.
        val outcomeUnknown = inProgress || (code5 == null && status in 500..504)
        return ScanFailureException(resolved, message, outcomeUnknown)
    }

    /** Map a transport-level failure to the user-facing 5-digit code. */
    fun forTransportError(e: Throwable): String = when (e) {
        is IOException -> "10101"
        else -> FALLBACK_CODE
    }
}

/**
 * A scan failure carrying the user-facing 5-digit code and its
 * plain-language message. The UI shows the message plus the code as a
 * support reference — never the raw HTTP status.
 */
class ScanFailureException(
    val code5: String,
    userMessage: String,
    /** True when the server never said what happened; keep looking. */
    val outcomeUnknown: Boolean = false
) : Exception(userMessage)
