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
        "30101" to "Our research AI declined this target. Not everything can be investigated.",
        "30201" to "Our safety systems blocked this investigation.",
        "40101" to "You're out of scans on this plan. Top up or upgrade to keep going.",
        "40201" to "Deep dives need a top-up credit. Pick up a top-up pack to unlock this.",
        "40301" to "We couldn't verify that purchase. If you were charged, contact support.",
        "50101" to "That doesn't look like a link we can scan. Check it and try again.",
        "50201" to "That image is too large to scan. Try a smaller one.",
        "60101" to "You've used this week's free scan. Come back next week, or pick a plan.",
        "60102" to "The ad didn't finish playing. Watch it all the way through for your free scan.",
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
    userMessage: String
) : Exception(userMessage)
