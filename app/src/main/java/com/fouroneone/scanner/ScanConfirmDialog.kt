/**
 * @file: ScanConfirmDialog.kt
 * @class: Class 1 (Focused UI Component)
 * @cap: 100 Lines
 * @responsibility:
 * Last check before a scan is sent: "spend a credit on this?". Shown after
 * the ad (or straight away for Professional), so an accidental scan can be
 * cancelled before anything is charged.
 *
 * @security_gate:
 * Cancel sends nothing to the server: no credit, no free scan, and no API
 * cost. Scan commits the attempt (every attempt counts).
 *
 * @owner_context:
 * 411 Scanner scan intake (fire ruling 2026-10-15).
 */

package com.fouroneone.scanner

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import kotlinx.coroutines.delay

// The ad's server ticket lives 15 minutes (functions/adGate.js); close
// before then so a late Scan can't fail on an expired ticket.
private const val CONFIRM_WINDOW_MS = 14 * 60 * 1000L

/** What the confirmation says this scan will spend. */
internal fun scanCostLine(quotaStatus: QuotaStatus): String {
    val server = quotaStatus.serverQuota
    return when {
        quotaStatus.isTesterUnlimited -> "This is a tester scan."
        server == null || server.isFree || !quotaStatus.isSubscriber ->
            "This uses your free scan for this week."
        // Same numbers as the header pill. The server spends subscription
        // scans first and top-ups only after; never add the two together.
        server.remaining > 0 ->
            "This uses 1 scan credit (${server.remaining}/${server.scansAllowed} left before this scan)."
        server.topUpScans > 0 ->
            "This uses 1 top-up credit (${server.topUpScans} left before this scan)."
        else -> "This uses 1 scan credit."
    }
}

@Composable
fun ScanConfirmDialog(
    quotaStatus: QuotaStatus,
    onScan: () -> Unit,
    onCancel: () -> Unit
) {
    LaunchedEffect(Unit) {
        delay(CONFIRM_WINDOW_MS)
        onCancel()
    }
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text("Scan this specimen?") },
        text = {
            Text(
                "${scanCostLine(quotaStatus)}\n\nCancel if this was a mistake: " +
                    "nothing is charged until you tap Scan."
            )
        },
        confirmButton = {
            Button(onClick = onScan) { Text("Scan") }
        },
        dismissButton = {
            TextButton(onClick = onCancel) { Text("Cancel") }
        }
    )
}
