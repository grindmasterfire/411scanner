/**
 * @file: ActionMeter.kt
 * @class: Class 2 (Standard UI Component)
 * @cap: 250 Lines
 * @responsibility: Render the server-authoritative Action Meter score and
 * human-facing verdict using current Master Calibration Ruler boundaries.
 * @dependencies: Jetpack Compose Material 3.
 * @security_gate: Presentation only. No score calculation, Floor Raiser
 * application, evidence interpretation, or verdict generation occurs here.
 * @owner_context: 411 Scanner Consumer 411 Action Meter presentation.
 *
 * Canon rule: the server-supplied verdict label is authoritative. Android
 * uses score boundaries only for presentation color/icon selection.
 * Action Meter scores are uncapped; values above 10 remain valid.
 */

package com.fouroneone.scanner

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Dangerous
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import java.util.Locale

@Composable
fun ActionMeter(
    score: Double,
    verdictLabel: String,
    modifier: Modifier = Modifier
) {
    val meterColor = getActionMeterColor(score)
    val meterIcon = getActionMeterIcon(score)

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(
            1.5.dp,
            meterColor.copy(alpha = 0.5f)
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "ACTION METER",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.ExtraBold,
                    color = MaterialTheme.colorScheme.outline
                )

                // No maximum suffix: Floor Raisers may push scores above 10.
                Text(
                    text = String.format(
                        Locale.US,
                        "SCORE: %.1f",
                        score
                    ),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Black,
                    color = meterColor
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            /*
             * Visual spectrum follows the canonical breakpoints:
             * 0-2.9, 3-4.9, 5-5.5, 5.6-5.9, 6-6.9, 7-7.9,
             * 8-8.9, 9-9.9, and 10+.
             *
             * Human verdict text is shown below rather than squeezed
             * into an unreadable phone-width legend.
             */
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(10.dp)
                    .clip(RoundedCornerShape(5.dp))
            ) {
                MeterBand(3.0f, Color(0xFF2E7D32))
                MeterBand(2.0f, Color(0xFF558B2F))
                MeterBand(0.6f, Color(0xFFF9A825))
                MeterBand(0.4f, Color(0xFFFF8F00))
                MeterBand(1.0f, Color(0xFFEF6C00))
                MeterBand(1.0f, Color(0xFFE65100))
                MeterBand(1.0f, Color(0xFFC62828))
                MeterBand(1.0f, Color(0xFF8E0000))
                MeterBand(0.6f, Color(0xFF4A0000))
            }

            Spacer(modifier = Modifier.height(14.dp))

            Surface(
                shape = RoundedCornerShape(10.dp),
                color = meterColor.copy(alpha = 0.12f),
                border = BorderStroke(1.dp, meterColor),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(
                            horizontal = 14.dp,
                            vertical = 10.dp
                        ),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = meterIcon,
                        contentDescription = null,
                        tint = meterColor,
                        modifier = Modifier.size(20.dp)
                    )

                    Spacer(modifier = Modifier.width(8.dp))

                    /*
                     * Never synthesize another Android verdict.
                     * The human-facing server label is authoritative.
                     */
                    Text(
                        text = verdictLabel.ifBlank {
                            "ACTION VERDICT UNAVAILABLE"
                        },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.ExtraBold,
                        color = meterColor,
                        textAlign = TextAlign.Center
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text =
                    "Server-calibrated decision from the six-vector " +
                        "diagnostic and validated Floor Raisers.",
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

/**
 * One visual spectrum segment.
 * Carries no scoring or verdict authority.
 */
@Composable
private fun RowScope.MeterBand(
    weight: Float,
    color: Color
) {
    Box(
        modifier = Modifier
            .weight(weight)
            .background(color)
    )
}

/**
 * Presentation colors mirror current calibration boundaries only.
 */
fun getActionMeterColor(score: Double): Color = when {
    score < 3.0 -> Color(0xFF2E7D32)
    score < 5.0 -> Color(0xFF558B2F)
    score < 5.6 -> Color(0xFFF9A825)
    score < 6.0 -> Color(0xFFFF8F00)
    score < 7.0 -> Color(0xFFEF6C00)
    score < 8.0 -> Color(0xFFE65100)
    score < 9.0 -> Color(0xFFC62828)
    score < 10.0 -> Color(0xFF8E0000)
    else -> Color(0xFF4A0000)
}

/**
 * Icons communicate intervention level without generating verdict text.
 */
fun getActionMeterIcon(score: Double): ImageVector = when {
    score < 5.0 -> Icons.Default.CheckCircle
    score < 6.0 -> Icons.Default.Info
    score < 8.0 -> Icons.Default.Warning
    else -> Icons.Default.Dangerous
}