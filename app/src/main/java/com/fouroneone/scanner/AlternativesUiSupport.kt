/**
 * @file: AlternativesUiSupport.kt
 * @class: Class 2 (Standard UI Support Component)
 * @cap: 250 Lines
 * @responsibility: Render reusable T06 discovery/contact cards and non-authoritative outbound navigation.
 * @dependencies: Android Intent/Uri, Jetpack Compose Material 3, Alternative.
 * @security_gate: Presentation/navigation only; never scores, vets, ranks, researches, or endorses.
 * @owner_context: 411 Scanner T06 discovery presentation support.
 */

package com.fouroneone.scanner

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun DiscoveryCard(
    alternative: Alternative,
    onOpenUrl: (String) -> Unit
) {
    val destination = alternative.destinationUrl.trim()
    val canOpen =
        destination.startsWith("https://") ||
            destination.startsWith("http://")

    val modifier =
        if (canOpen) {
            Modifier
                .fillMaxWidth()
                .clickable { onOpenUrl(destination) }
        } else {
            Modifier.fillMaxWidth()
        }

    Card(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFFCFBFF)),
        border = BorderStroke(1.dp, Color(0xFFE6E0E9))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(5.dp)
        ) {
            Text(
                text = relationshipLabel(alternative.relationship),
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF6750A4),
                letterSpacing = 0.5.sp
            )
            Text(
                text = alternative.name,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF1E1B2E)
            )
            if (alternative.description.isNotBlank()) {
                Text(
                    text = alternative.description,
                    fontSize = 12.sp,
                    color = Color(0xFF49454F)
                )
            }
            if (canOpen) {
                Text(
                    text = "Explore",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF6750A4)
                )
            }
        }
    }
}

@Composable
fun GuidanceCard(
    title: String,
    text: String
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFF7F2FA)),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, Color(0xFFE6E0E9))
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Info,
                contentDescription = null,
                tint = Color(0xFF6750A4),
                modifier = Modifier.size(20.dp)
            )
            Column {
                Text(
                    text = title,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF6750A4)
                )
                Spacer(modifier = Modifier.height(3.dp))
                Text(
                    text = text,
                    fontSize = 12.sp,
                    color = Color(0xFF49454F)
                )
            }
        }
    }
}

@Composable
fun ContactCard(
    label: String,
    value: String,
    icon: (@Composable () -> Unit)? = null,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFE6E0E9))
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            icon?.invoke()
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = label,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF49454F)
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = value,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    color = Color(0xFF1E1B2E)
                )
            }
        }
    }
}

/**
 * Explains relevance without implying that 411 inspected or approved the destination.
 */
private fun relationshipLabel(
    relationship: String
): String = when (relationship) {
    "comparative" -> "SIMILAR OPTION"
    "complementary" -> "COMPLEMENTS THIS INTEREST"
    "adjacent" -> "RELATED INTEREST"
    "probabilistic" -> "YOU MAY ALSO LIKE"
    "related_campaign" -> "RELATED CAMPAIGN"
    else -> "WORTH EXPLORING"
}

fun openAlternativeUrl(
    context: Context,
    url: String
) {
    try {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse(url))
        )
    } catch (_: Exception) {
        /*
         * Navigation failure is non-fatal.
         * Never invent a fallback destination.
         */
    }
}

fun openAlternativeDialer(
    context: Context,
    phone: String
) {
    try {
        context.startActivity(
            Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
        )
    } catch (_: Exception) {
        // Navigation failure cannot alter the report.
    }
}

fun openAlternativeEmail(
    context: Context,
    email: String
) {
    try {
        context.startActivity(
            Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:$email"))
        )
    } catch (_: Exception) {
        // Navigation failure cannot alter the report.
    }
}
