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
import java.util.Locale

@Composable
fun ActionMeter(
    score: Double,
    verdictBadge: String,
    modifier: Modifier = Modifier
) {
    val badgeColor = getActionMeterColor(score)
    val badgeIcon = getActionMeterIcon(score)

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
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
                    text = String.format(Locale.US, "SCORE: %.1f / 10", score),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Black,
                    color = badgeColor
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            // 5-Zone Spectrum Bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(10.dp)
                    .clip(RoundedCornerShape(5.dp))
            ) {
                Box(modifier = Modifier.weight(3f).background(Color(0xFF2E7D32))) // 0-2 Safe
                Box(modifier = Modifier.weight(2f).background(Color(0xFF757575))) // 3-4 Solid
                Box(modifier = Modifier.weight(1f).background(Color(0xFFF9A825))) // 5 Tribe
                Box(modifier = Modifier.weight(2f).background(Color(0xFFE65100))) // 6-7 Narrow
                Box(modifier = Modifier.weight(3f).background(Color(0xFFC62828))) // 8-10 Delete
            }

            Spacer(modifier = Modifier.height(6.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(text = "0-2 Safe", fontSize = 10.sp, color = Color(0xFF2E7D32))
                Text(text = "3-4 Solid", fontSize = 10.sp, color = Color(0xFF757575))
                Text(text = "5 Tribe", fontSize = 10.sp, color = Color(0xFFF9A825))
                Text(text = "6-7 Narrow", fontSize = 10.sp, color = Color(0xFFE65100))
                Text(text = "8-10 Delete", fontSize = 10.sp, color = Color(0xFFC62828))
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Action Verdict Badge
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
                    Icon(imageVector = badgeIcon, contentDescription = null, tint = badgeColor, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = verdictBadge.ifBlank { getDefaultVerdict(score) },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.ExtraBold,
                        color = badgeColor
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            val description = when {
                score < 3.0 -> "Universal utility. Open baseline software fit for anyone."
                score < 5.0 -> "Solid baseline. Standard mechanics and transparent trade-offs."
                score < 6.0 -> "Your Tribe. Built for a specific community or specialized workflow."
                score < 8.0 -> "Not for everyone. High entry hurdles, pushy funnels, or narrow utility."
                else -> "Extreme local battery, data, or financial drain."
            }

            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

fun getActionMeterColor(score: Double): Color = when {
    score < 3.0 -> Color(0xFF2E7D32)
    score < 5.0 -> Color(0xFF5A5A5A)
    score < 6.0 -> Color(0xFFF9A825)
    score < 8.0 -> Color(0xFFE65100)
    else -> Color(0xFFC62828)
}

fun getActionMeterIcon(score: Double): ImageVector = when {
    score < 3.0 -> Icons.Default.CheckCircle
    score < 6.0 -> Icons.Default.Info
    score < 8.0 -> Icons.Default.Warning
    else -> Icons.Default.Dangerous
}

fun getDefaultVerdict(score: Double): String = when {
    score < 3.0 -> "DOWNLOAD IT"
    score < 5.0 -> "DOWNLOAD WITH CONTEXT"
    score < 6.0 -> "YOUR TRIBE"
    score < 8.0 -> "HIGH FRICTION / SKIP"
    else -> "DELETE FROM DEVICE"
}