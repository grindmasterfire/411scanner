/**
 * @file: ScanTelemetryReadout.kt
 * @class: Class 2 (Standard UI/Data Component)
 * @cap: 250 Lines
 * @responsibility: Render read-only Gemini token telemetry attached to a completed scan.
 * @dependencies: Jetpack Compose, ScanTelemetry
 * @security_gate: Display-only QA surface. Does not invoke Gemini, alter reports, or expose credentials.
 * @owner_context: 411 Scanner calibration and production token-consumption verification.
 */

package com.fouroneone.scanner

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Displays the actual token counts returned by Gemini for calibration.
 *
 * The renderer deliberately uses the server telemetry values rather than
 * estimating consumption from prompt or response text on the Android side.
 */
@Composable
fun ScanTelemetryReadout(
    telemetry: ScanTelemetry
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFFF7F5FA)
        )
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = "SCAN TELEMETRY",
                fontSize = 11.sp,
                fontWeight = FontWeight.Black,
                color = Color(0xFF6750A4),
                letterSpacing = 0.8.sp
            )

            if (telemetry.model.isNotBlank()) {
                TelemetryRow("Model", telemetry.model)
            }

            TelemetryRow(
                "Prompt Tokens",
                telemetry.promptTokenCount.toString()
            )

            TelemetryRow(
                "Output Tokens",
                telemetry.candidatesTokenCount.toString()
            )

            TelemetryRow(
                "Thinking Tokens",
                telemetry.thoughtsTokenCount.toString()
            )

            TelemetryRow(
                "Total Tokens",
                telemetry.totalTokenCount.toString()
            )

            TelemetryRow(
                "Cached Tokens",
                telemetry.cachedContentTokenCount.toString()
            )

            if (!telemetry.finishReason.isNullOrBlank()) {
                TelemetryRow(
                    "Finish Reason",
                    telemetry.finishReason
                )
            }
        }
    }
}

/**
 * Keeps each telemetry value aligned and visually scannable at narrow widths.
 */
@Composable
private fun TelemetryRow(
    label: String,
    value: String
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            fontSize = 12.sp,
            color = Color(0xFF79747E),
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )

        Spacer(modifier = Modifier.width(8.dp))

        Text(
            text = value,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = Color(0xFF1D1B20),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}