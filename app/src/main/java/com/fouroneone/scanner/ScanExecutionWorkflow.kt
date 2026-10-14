/**
 * @file: ScanExecutionWorkflow.kt
 * @class: Class 1 (Focused Logic Component)
 * @cap: 150 Lines
 * @responsibility:
 * Complete delivery of one production scan: validate the returned 411
 * report, persist it into local history, and consume quota only after
 * validation.
 *
 * @dependencies:
 * Android Context, ScanReport, ScanHistoryManager, QuotaManager.
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
 * Execution order is intentionally strict (the request itself is sent by
 * ScanWorker in the background):
 * 1. Confirm Android can parse the returned report.
 * 2. Save the successfully delivered report into local Recent Scans.
 * 3. Consume one scan entitlement.
 * 4. Return the raw report to the caller.
 *
 * Any exception before step 3 leaves the user's quota untouched.
 */
object ScanExecutionWorkflow {

    /**
     * Complete the delivery transaction for a scan result, whether it
     * came back on the scan request or via getScanResult polling.
     * Called by ScanWorker. Quota is consumed only after the report
     * validates.
     */
    suspend fun completeDelivery(
        context: Context,
        rawResponse: String,
        requestId: String
    ): String {
        val validatedReport =
            ScanReport.fromJson(rawResponse)

        AppLog.event("parse") {
            "scan ${if (validatedReport != null) "success" else "failure"} parser=ScanReportParser.fromJson"
        }

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
            rawResponse,
            requestId
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
