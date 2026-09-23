/**
 * @file: ScanReportParser.kt
 * @class: Class 1 (Atomic Logic Component)
 * @cap: 150 Lines
 * @responsibility: Orchestrate conversion of a production scan JSON response into a ScanReport.
 * @dependencies: org.json.JSONObject, ScanReportSectionParser
 * @security_gate: Read-only parsing. No network access, scoring mutation, or persistence.
 * @owner_context: 411 Scanner Android production-response parsing boundary.
 */

package com.fouroneone.scanner

import org.json.JSONObject

/**
 * Top-level parser for the production scan response.
 *
 * Section-specific parsing is delegated so this component owns only
 * response-envelope resolution and ScanReport assembly.
 */
object ScanReportParser {

    fun fromJson(jsonString: String): ScanReport? {
        return try {
            val root = JSONObject(jsonString)
            val reportObj = resolveReportObject(root)

            ScanReport(
                consumerCard =
                    ScanReportSectionParser.parseConsumerCard(
                        reportObj
                    ),
                solicitationIdentity =
                    ScanReportSectionParser.parseSolicitationIdentity(
                        reportObj
                    ),
                solicitationPattern =
                    ScanReportSectionParser.parseSolicitationPattern(
                        reportObj
                    ),
                technicalLedger =
                    TechnicalLedgerParser.parse(
                        reportObj
                    ),
                alternatives =
                    ScanReportSectionParser.parseAlternatives(
                        reportObj
                    ),
                telemetry =
                    ScanReportSectionParser.parseTelemetry(
                        root
                    ),
                cacheKey =
                    root.optString(
                        "cacheKey",
                        ""
                    )
            )
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Resolves the supported Firebase/callable response envelopes
     * without changing the underlying report payload.
     */
    private fun resolveReportObject(
        root: JSONObject
    ): JSONObject {
        return when {
            root.has("report") ->
                root.getJSONObject("report")

            root.has("result") &&
                root.optJSONObject("result")
                    ?.has("report") == true ->
                root.getJSONObject("result")
                    .getJSONObject("report")

            root.has("result") &&
                root.optJSONObject("result")
                    ?.has("consumer_card") == true ->
                root.getJSONObject("result")

            root.has("consumer_card") ->
                root

            else ->
                root
        }
    }
}