/**
 * @file: ScanTelemetry.kt
 * @class: Class 1 (Hooks, Helpers, & Constants)
 * @cap: 150 Lines
 * @responsibility: Hold server-reported Gemini generation telemetry for calibration and QA display.
 * @dependencies: None
 * @security_gate: Read-only telemetry model. Contains no credentials, user content, or mutation logic.
 * @owner_context: 411 Scanner production scan telemetry returned by the Firebase scan function.
 */

package com.fouroneone.scanner

/**
 * Token and generation metadata reported by Gemini for one scan operation.
 *
 * Keeping telemetry separate from ScanReport prevents calibration data from
 * expanding the consumer report model and keeps the production report contract
 * independent from the QA presentation layer.
 */
data class ScanTelemetry(
    val operation: String = "",
    val model: String = "",
    val promptTokenCount: Int = 0,
    val candidatesTokenCount: Int = 0,
    val totalTokenCount: Int = 0,
    val cachedContentTokenCount: Int = 0,
    val thoughtsTokenCount: Int = 0,
    val finishReason: String? = null
)