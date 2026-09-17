/**
 * @file: ScanExecutionWorkflow.kt
 * @class: Class 1 (Focused Logic Component)
 * @cap: 150 Lines
 * @responsibility:
 * Execute one production scan through the Android client, forward the optional
 * OCR Cache Bank clue, validate the returned 411 report, persist successful
 * delivery into local history, and consume quota only after validation.
 *
 * @dependencies:
 * Android Context, ScanRepository, ScanReport, ScanHistoryManager,
 * QuotaManager.
 *
 * @security_gate:
 * OCR remains a non-authoritative transport clue. This workflow does not
 * calculate scores, establish solicitation identity, alter evidence, modify
 * Gemini output, or write directly to Cache Bank.
 *
 * @owner_context:
 * 411 Scanner production Android scan-delivery transaction.
 *
 * @critical_rule:
 * Beginning a network request is not a completed scan. User entitlement is
 * consumed only after Android receives and parses a valid report.
 */

package com.fouroneone.scanner

import android.content.Context

/**
 * Owns the client-side completion transaction for one production scan.
 *
 * Execution order is intentionally strict:
 * 1. Request the report from the production scan endpoint.
 * 2. Confirm Android can parse the returned report.
 * 3. Save the successfully delivered report into local Recent Scans.
 * 4. Consume one scan entitlement.
 * 5. Return the raw report to the presentation layer.
 *
 * Any exception before step 4 leaves the user's quota untouched.
 */
object ScanExecutionWorkflow {

    suspend fun execute(
        context: Context,
        base64Image: String,
        ocrText: String = ""
    ): String {
        /*
         * OCR travels beside the image but does not change the Android
         * completion transaction. An empty OCR string is valid and simply
         * causes the server to skip cross-creative candidate discovery.
         */
        val rawResponse =
            ScanRepository.scan(
                base64Image = base64Image,
                ocrText = ocrText
            )

        /*
         * Validation is the delivery boundary.
         *
         * A server response may already exist in Cache Bank, but Android
         * does not treat the scan as delivered until its current parser can
         * successfully construct the production ScanReport.
         */
        val validatedReport =
            ScanReport.fromJson(rawResponse)

        if (validatedReport == null) {
            throw IllegalStateException(
                "Scan completed but returned an unreadable report"
            )
        }

        /*
         * Local history records reports actually received by this device.
         * It remains separate from server-side Cache Bank storage.
         */
        ScanHistoryManager.saveScan(
            context,
            rawResponse
        )

        /*
         * Quota consumption remains last among completion requirements.
         * OCR failure, network failure, interrupted responses, or malformed
         * reports therefore cannot consume a scan without valid delivery.
         */
        QuotaManager.recordScan(context)

        return rawResponse
    }
}
