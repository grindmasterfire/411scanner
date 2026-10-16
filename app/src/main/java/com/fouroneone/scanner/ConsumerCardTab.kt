/**
 * @file: ConsumerCardTab.kt
 * @class: Class 3 (Feature Component)
 * @cap: 400 Lines
 * @responsibility: Render the primary Consumer 411 diagnostic surface,
 * Essential 411, and on-demand Deep Dive. Scan telemetry (model, tokens)
 * is never shown to users; it lives in the Business Center.
 * @dependencies: Jetpack Compose, ConsumerCard, ActionMeter, SixVectorGrid.
 * @security_gate: Presentation only. Diagnostic scoring and Deep Dive
 * generation remain outside this component.
 * @owner_context: 411 Scanner Consumer Card result surface.
 */

package com.fouroneone.scanner

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Consumer-facing report surface.
 *
 * Report data remains immutable. Telemetry is read-only, and Deep Dive
 * remains explicitly on-demand.
 */
@Composable
fun ConsumerCardTab(
    consumerCard: ConsumerCard?,
    /** A Deep Dive already bought for this report: shown without a new charge. */
    savedDeepDive: String? = null,
    /** A Deep Dive for this report is running in the background. */
    deepDiveRunning: Boolean = false,
    /** Why the last background Deep Dive couldn't finish (shown once). */
    deepDiveFailure: String? = null,
    /** Top-up credits left (server); null when not known yet. */
    topUpCreditsLeft: Int? = null,
    /** Tester account: Deep Dives are never charged. */
    deepDiveUnlimited: Boolean = false,
    /** Start a Deep Dive in the background (after the user confirmed the credit). */
    onRequestDeepDive: (() -> Unit)? = null,
    onDismissDeepDiveFailure: () -> Unit = {}
) {
    if (consumerCard == null) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "No diagnostic data available.",
                color = Color.Gray
            )
        }
        return
    }

    var showDiveConfirm by remember { mutableStateOf(false) }
    val hasDive = !savedDeepDive.isNullOrBlank()

    // Every Deep Dive, first or re-dive, is a confirmed 1-credit spend.
    if (showDiveConfirm) {
        AlertDialog(
            onDismissRequest = { showDiveConfirm = false },
            title = { Text(deepDiveConfirmTitle(hasDive)) },
            text = { Text(deepDiveCostLine(hasDive, topUpCreditsLeft, deepDiveUnlimited)) },
            confirmButton = {
                if (canRunDeepDive(topUpCreditsLeft, deepDiveUnlimited)) {
                    Button(onClick = {
                        showDiveConfirm = false
                        onRequestDeepDive?.invoke()
                    }) { Text("Run") }
                } else {
                    // No credit: nothing to confirm, just say so.
                    Button(onClick = { showDiveConfirm = false }) { Text("OK") }
                }
            },
            dismissButton = {
                if (canRunDeepDive(topUpCreditsLeft, deepDiveUnlimited)) {
                    TextButton(onClick = { showDiveConfirm = false }) { Text("Cancel") }
                }
            }
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .navigationBarsPadding(),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Identity is established before diagnostic interpretation.
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = Color(0xFFFAFAFE)
            ),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                Text(
                    text = consumerCard.targetName,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF1E1B2E)
                )

                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    text = "Entity: ${consumerCard.developerOrEntity}",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    color = Color(0xFF6B4EA2)
                )

                if (consumerCard.interfaceSurface.isNotBlank()) {
                    Spacer(modifier = Modifier.height(2.dp))

                    Text(
                        text = consumerCard.interfaceSurface,
                        fontSize = 12.sp,
                        color = Color(0xFF79747E)
                    )
                }
            }
        }

        /*
         * Human-facing verdict text comes directly from the server.
         * Android does not translate the machine compatibility badge.
         */
        ActionMeter(
            score = consumerCard.actionMeterScore,
            verdictLabel = consumerCard.verdictLabel
        )

        // Required infrastructure: the meter carries an exception label only.
        // Why an entity is on the list is explained in the user manual
        // (owner ruling 2026-10-14), not in the report.
        consumerCard.infrastructureException?.let {
            Text(
                text = infrastructureExceptionText(
                    consumerCard.actionMeterScore,
                    consumerCard.verdictLabel
                ),
                fontSize = 12.sp,
                color = Color(0xFF49454F),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 4.dp, vertical = 6.dp)
            )
        }

        SixVectorGrid(
            metrics = consumerCard.metrics,
            annotations = consumerCard.metricAnnotations
        )

        // Concise evidence-based consumer takeaway.
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = Color(0xFFF3EDF7)
            ),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                Text(
                    text = "THE ESSENTIAL 411",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Black,
                    color = Color(0xFF6750A4),
                    letterSpacing = 0.8.sp
                )

                Spacer(modifier = Modifier.height(6.dp))

                Text(
                    text = consumerCard.essential411.ifBlank {
                        consumerCard.tagline
                    },
                    fontSize = 13.sp,
                    lineHeight = 19.sp,
                    color = Color(0xFF1D1B20)
                )

                if (consumerCard.secondaryTargetsNote.isNotBlank()) {
                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = consumerCard.secondaryTargetsNote,
                        fontSize = 12.sp,
                        color = Color(0xFF79747E),
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }

        /*
         * Deep Dive (fire 2026-10-16): one button. It reads "Would You Like
         * To Know More?" until a Deep Dive exists, then "Re-dive for a new
         * credit?" in the same place. Every tap asks before spending; the
         * dive runs in the background and arrives by notification.
         */
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = Color.White
            ),
            shape = RoundedCornerShape(14.dp),
            border = BorderStroke(
                1.dp,
                Color(0xFFE0E0E0)
            )
        ) {
            Column(
                modifier = Modifier.padding(12.dp)
            ) {
                if (onRequestDeepDive != null) {
                    OutlinedButton(
                        onClick = {
                            onDismissDeepDiveFailure()
                            showDiveConfirm = true
                        },
                        // One at a time: a running dive can't be sent again.
                        enabled = !deepDiveRunning,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = Color(0xFF6750A4)
                        )
                    ) {
                        if (deepDiveRunning) {
                            CircularProgressIndicator(
                                modifier = Modifier
                                    .width(16.dp)
                                    .height(16.dp),
                                color = Color(0xFF6750A4),
                                strokeWidth = 2.dp
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                        } else {
                            Icon(
                                imageVector = Icons.Default.Info,
                                contentDescription = null,
                                tint = Color(0xFF6750A4)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                        }
                        Text(
                            text = deepDiveButtonLabel(hasDive, deepDiveRunning, topUpCreditsLeft, deepDiveUnlimited),
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                if (deepDiveRunning) {
                    Text(
                        text = DEEP_DIVE_RUNNING_NOTE,
                        modifier = Modifier.padding(top = 8.dp),
                        fontSize = 12.sp,
                        lineHeight = 17.sp,
                        color = Color(0xFF5E5970)
                    )
                }

                deepDiveFailure?.let { err ->
                    Text(
                        text = err,
                        modifier = Modifier.padding(top = 8.dp),
                        fontSize = 12.sp,
                        lineHeight = 17.sp,
                        color = Color(0xFFB3261E)
                    )
                }

                if (hasDive) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(
                                top = 12.dp,
                                start = 4.dp,
                                end = 4.dp
                            ),
                        verticalArrangement =
                            Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = "DEEP DIVE 411",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF5E5970)
                        )

                        Text(
                            text = savedDeepDive ?: "",
                            fontSize = 12.sp,
                            lineHeight = 18.sp,
                            color = Color(0xFF49454F)
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
    }
}

internal const val DEEP_DIVE_RUNNING_NOTE =
    "Your Deep Dive is running. We'll notify you when it's ready; you can leave the app."

/** "(3 left)", "(unlimited)" for the tester, or nothing while unknown. */
internal fun creditsTag(left: Int?, unlimited: Boolean): String = when {
    unlimited -> " (unlimited)"
    left == null -> ""
    else -> " ($left left)"
}

/** The one Deep Dive button, in place: first dive, re-dive, or running. */
internal fun deepDiveButtonLabel(
    hasDive: Boolean,
    running: Boolean,
    left: Int? = null,
    unlimited: Boolean = false
): String = when {
    running -> "Deep Dive running…"
    hasDive -> "Re-dive for an additional credit?" + creditsTag(left, unlimited)
    else -> "Would You Like To Know More?" + creditsTag(left, unlimited)
}

internal fun deepDiveConfirmTitle(hasDive: Boolean): String =
    if (hasDive) "Run a new Deep Dive?" else "Run a Deep Dive?"

/** False only when the server says the bank is empty (the tester is never charged). */
internal fun canRunDeepDive(left: Int?, unlimited: Boolean): Boolean =
    unlimited || left == null || left > 0

private fun credits(n: Int) = if (n == 1) "1 top-up credit" else "$n top-up credits"

/** The credit guard, on every dive (same as the scan confirmation). */
internal fun deepDiveCostLine(hasDive: Boolean, left: Int? = null, unlimited: Boolean = false): String {
    val same = if (hasDive) ", even if the new Deep Dive matches the one you have" else ""
    return when {
        unlimited -> "Tester account: this Deep Dive is not charged. Run it?"
        left == null -> "You are about to use 1 top-up credit$same. Are you sure? Nothing is charged until you tap Run."
        left <= 0 -> "You have no top-up credits left. A Deep Dive uses 1 top-up credit: add a top-up from Plans first."
        else -> "You have ${credits(left)}. This Deep Dive uses 1$same, leaving ${left - 1}. " +
            "Are you sure? Nothing is charged until you tap Run."
    }
}

/** "7.9 for professional consideration only, with an exception." */
internal fun infrastructureExceptionText(score: Double, verdictLabel: String): String =
    "$score for ${verdictLabel.lowercase()}, with an exception."
