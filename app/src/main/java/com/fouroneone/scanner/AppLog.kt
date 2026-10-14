/**
 * @file: AppLog.kt
 * @class: Class 1 (Hooks, Helpers, & Constants)
 * @cap: 150 Lines
 * @responsibility: Hold the last ~300 scrubbed scan-diagnostic lines in memory for debug builds.
 * @dependencies: BuildConfig
 * @security_gate:
 * DEBUG builds only. Release builds record nothing. Every line is scrubbed
 * of bearer tokens, JWTs, emails, and image/base64 data before storage.
 * Callers must never pass request or response bodies.
 * @owner_context: 411 Scanner debug diagnostics feeding functions/scripts/ask-gemini.js.
 */

package com.fouroneone.scanner

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * App-owned diagnostic ring buffer.
 *
 * Additive only: this never writes to logcat, so existing Log.* output is
 * unchanged. Debug builds upload the buffer after each scan finishes
 * (see DiagnosticsUploader.uploadAfterScan).
 */
object AppLog {

    const val CAPACITY = 300
    private const val MAX_LINE_LENGTH = 300

    private val lines = ArrayDeque<String>(CAPACITY)
    private val timeFormat = SimpleDateFormat("HH:mm:ss.SSS", Locale.US)

    /** The most recent scan identity (clientRequestId == server requestId). */
    @Volatile
    var lastRequestId: String? = null
        private set

    private val SCRUBBERS = listOf(
        Regex("data:[\\w.+-]+/[\\w.+-]+;base64,[A-Za-z0-9+/=]+") to "[base64]",
        Regex("(?i)bearer\\s+[A-Za-z0-9._~+/=-]+") to "Bearer [redacted]",
        Regex("eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]*") to "[jwt]",
        Regex("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}") to "[email]",
        // Long unbroken base64 runs (image bytes). 100+ keeps 64-char hex cache keys intact.
        Regex("[A-Za-z0-9+/]{100,}={0,2}") to "[base64]"
    )

    /**
     * Records one event. The message lambda is never evaluated in release
     * builds, so no diagnostic strings are even built there.
     */
    inline fun event(tag: String, message: () -> String) {
        if (BuildConfig.DEBUG) record(tag, message())
    }

    /** Marks the scan the buffer currently belongs to. */
    fun beginScan(requestId: String) {
        if (!BuildConfig.DEBUG) return
        lastRequestId = requestId
        record("scan", "requestId=$requestId")
    }

    @PublishedApi
    internal fun record(tag: String, message: String) {
        val line = scrub("${timeFormat.format(Date())} [$tag] $message")
            .take(MAX_LINE_LENGTH)
        synchronized(lines) {
            if (lines.size >= CAPACITY) lines.removeFirst()
            lines.addLast(line)
        }
    }

    fun snapshot(): List<String> {
        if (!BuildConfig.DEBUG) return emptyList()
        return synchronized(lines) { lines.toList() }
    }

    fun scrub(text: String): String =
        SCRUBBERS.fold(text) { acc, (pattern, replacement) ->
            pattern.replace(acc, replacement)
        }

    /**
     * Names the app parser that threw: the deepest stack frame inside this
     * package, e.g. "TechnicalLedgerParser.parse". Never includes the
     * exception message, which can quote response JSON.
     */
    fun failingParser(e: Throwable): String =
        e.stackTrace
            .firstOrNull { it.className.startsWith("com.fouroneone.scanner") }
            ?.let { "${it.className.substringAfterLast('.')}.${it.methodName}" }
            ?: "unknown"
}
