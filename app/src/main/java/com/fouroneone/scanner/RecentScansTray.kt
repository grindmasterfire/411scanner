package com.fouroneone.scanner

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
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
import java.util.Locale

@Composable
fun RecentScansTray(
    recentScans: List<ScanHistoryItem>,
    onSelectScan: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    if (recentScans.isEmpty()) return

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "RECENT DIAGNOSTIC AUDITS",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF5E5970),
                letterSpacing = 1.sp
            )
            Text(
                text = "${recentScans.size} Cached",
                fontSize = 11.sp,
                color = Color.Gray
            )
        }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            recentScans.forEach { item ->
                RecentScanCard(item = item, onClick = { onSelectScan(item.rawJson) })
            }
        }
    }
}

@Composable
private fun RecentScanCard(
    item: ScanHistoryItem,
    onClick: () -> Unit
) {
    val badgeColor = when {
        item.score < 3.0 -> Color(0xFF2E7D32)
        item.score < 5.0 -> Color(0xFF5A5A5A)
        item.score < 6.0 -> Color(0xFFE65100)
        item.score < 7.0 -> Color(0xFFEF6C00)
        item.score < 8.0 -> Color(0xFFD84315)
        item.score < 9.0 -> Color(0xFFC62828)
        else -> Color(0xFFB71C1C)
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .border(1.dp, Color(0xFFE0E0E0), RoundedCornerShape(12.dp)),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.targetName,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF1E1B2E),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = item.badge,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    color = badgeColor,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Box(
                modifier = Modifier
                    .background(badgeColor.copy(alpha = 0.12f), RoundedCornerShape(8.dp))
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = String.format(Locale.US, "%.1f", item.score),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Black,
                    color = badgeColor
                )
            }
        }
    }
}