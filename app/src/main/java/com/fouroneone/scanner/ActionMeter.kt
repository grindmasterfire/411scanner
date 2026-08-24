package com.fouroneone.scanner

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.unit.sp

/**
 * Action Meter score display gauge with 0-10 calibrated scale spectrum and verdict visual badge.
 */
@Composable
fun ActionMeter(
    score: Int,
    verdictBadge: String,
    modifier: Modifier = Modifier
) {
    val normalizedScore = score.coerceIn(0, 10)
    val badgeColor = getActionMeterColor(normalizedScore)
    val badgeIcon = getActionMeterIcon(normalizedScore)

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.5.dp, badgeColor.copy(alpha = 0.5f))
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
                Text(
                    text = "SCORE: $normalizedScore / 10",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Black,
                    color = badgeColor
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            // 5-Zone Spectrum Bar
            SpectrumScaleBar(currentScore = normalizedScore)

            Spacer(modifier = Modifier.height(14.dp))

            // Prominent Verdict Badge Banner
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = badgeColor.copy(alpha = 0.12f),
                border = BorderStroke(1.dp, badgeColor),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = badgeIcon,
                        contentDescription = null,
                        tint = badgeColor,
                        modifier = Modifier.size(22.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = verdictBadge.ifBlank { getDefaultVerdict(normalizedScore) },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.ExtraBold,
                        color = badgeColor
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            ActionMeterDescription(score = normalizedScore, color = badgeColor)
        }
    }
}

@Composable
private fun SpectrumScaleBar(currentScore: Int) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(12.dp)
                .clip(RoundedCornerShape(6.dp))
        ) {
            Box(modifier = Modifier.weight(3f).background(Color(0xFF2E7D32))) // 0-2 (Green / Download)
            Box(modifier = Modifier.weight(2f).background(Color(0xFFFBC02D))) // 3-4 (Yellow / Context)
            Box(modifier = Modifier.weight(1f).background(Color(0xFFF57C00))) // 5 (Orange / Solid)
            Box(modifier = Modifier.weight(2f).background(Color(0xFFD32F2F))) // 6-7 (Red / High Friction)
            Box(modifier = Modifier.weight(3f).background(Color(0xFF212121))) // 8-10 (Black / Delete)
        }

        Spacer(modifier = Modifier.height(6.dp))

        // Scale Labels
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(text = "0 Safe", style = MaterialTheme.typography.labelSmall, fontSize = 10.sp, color = Color(0xFF2E7D32))
            Text(text = "3-4 Context", style = MaterialTheme.typography.labelSmall, fontSize = 10.sp, color = Color(0xFFFBC02D))
            Text(text = "5 Solid", style = MaterialTheme.typography.labelSmall, fontSize = 10.sp, color = Color(0xFFF57C00))
            Text(text = "6-7 Friction", style = MaterialTheme.typography.labelSmall, fontSize = 10.sp, color = Color(0xFFD32F2F))
            Text(text = "8-10 Delete", style = MaterialTheme.typography.labelSmall, fontSize = 10.sp, color = Color(0xFF212121))
        }
    }
}

@Composable
fun ActionMeterDescription(score: Int, color: Color) {
    val description = when (score) {
        in 0..2 -> "Universal fit. Clean utility or official consumer tool."
        in 3..4 -> "Niche fit. Built for a specific purpose or workflow."
        5 -> "Solid baseline. Standard mechanics and transparent trade-offs."
        in 6..7 -> "High friction. Aggressive pushy funnels or heavy ad loads."
        in 8..10 -> "Severe hazard or predatory monetization architecture."
        else -> "Severe hazard. Structural friction present."
    }
    Text(
        text = description,
        style = MaterialTheme.typography.bodySmall,
        textAlign = TextAlign.Center,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
}

fun getActionMeterColor(score: Int): Color {
    return when {
        score <= 2 -> Color(0xFF2E7D32) // Green
        score <= 4 -> Color(0xFFFBC02D) // Yellow
        score == 5 -> Color(0xFFF57C00) // Orange
        score <= 7 -> Color(0xFFD32F2F) // Red
        else -> Color(0xFF212121)       // Black / Dark
    }
}

fun getActionMeterIcon(score: Int): ImageVector {
    return when {
        score <= 2 -> Icons.Default.CheckCircle
        score <= 4 -> Icons.Default.Info
        score == 5 -> Icons.Default.Info
        score <= 7 -> Icons.Default.Warning
        else -> Icons.Default.Dangerous
    }
}

fun getDefaultVerdict(score: Int): String {
    return when {
        score <= 2 -> "DOWNLOAD IT"
        score <= 4 -> "DOWNLOAD WITH CONTEXT"
        score == 5 -> "SOLID APP"
        score <= 7 -> "HIGH FRICTION / SKIP"
        else -> "DELETE FROM EARTH"
    }
}

fun getVectorScoreColor(score: Int, isFriction: Boolean): Color {
    return if (isFriction) {
        if (score >= 7) Color(0xFFD32F2F) else if (score >= 4) Color(0xFFF57C00) else Color(0xFF2E7D32)
    } else {
        if (score >= 7) Color(0xFF2E7D32) else if (score >= 4) Color(0xFFF57C00) else Color(0xFFD32F2F)
    }
}
