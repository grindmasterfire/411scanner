package com.fouroneone.scanner

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LockClock
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/**
 * Compact header badge displaying real-time scan quota and auth trigger.
 */
@Composable
fun QuotaHeaderBadge(
    quotaStatus: QuotaStatus,
    modifier: Modifier = Modifier,
    onAuthClick: () -> Unit = {}
) {
    val userState by AuthManager.userState.collectAsStateWithLifecycle()

    val (bgColor, textColor, icon, label) = when {
        quotaStatus.isLifetimeUnlocked -> Quadruple(
            MaterialTheme.colorScheme.primaryContainer,
            MaterialTheme.colorScheme.onPrimaryContainer,
            Icons.Default.WorkspacePremium,
            "PRO LIFETIME UNLIMITED"
        )
        quotaStatus.isUnlimited -> Quadruple(
            MaterialTheme.colorScheme.tertiaryContainer,
            MaterialTheme.colorScheme.onTertiaryContainer,
            Icons.Default.LockClock,
            "24H PASS ACTIVE"
        )
        quotaStatus.remainingScans > 0 -> Quadruple(
            MaterialTheme.colorScheme.secondaryContainer,
            MaterialTheme.colorScheme.onSecondaryContainer,
            Icons.Default.Bolt,
            "${quotaStatus.remainingScans}/${quotaStatus.maxDailyScans} FREE SCANS TODAY"
        )
        else -> Quadruple(
            MaterialTheme.colorScheme.errorContainer,
            MaterialTheme.colorScheme.onErrorContainer,
            Icons.Default.Bolt,
            "0/${quotaStatus.maxDailyScans} SCANS • QUOTA REACHED"
        )
    }

    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(20.dp))
                .background(bgColor)
                .padding(horizontal = 12.dp, vertical = 6.dp)
                .testTag("quota_header_badge")
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = textColor,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = textColor
                )
            }
        }

        Spacer(modifier = Modifier.width(8.dp))

        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(20.dp))
                .background(if (userState.isAuthenticated && !userState.isAnonymous) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant)
                .clickable { onAuthClick() }
                .padding(horizontal = 10.dp, vertical = 6.dp)
                .testTag("auth_chip_button")
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = if (userState.isAuthenticated && !userState.isAnonymous) Icons.Default.CheckCircle else Icons.Default.AccountCircle,
                    contentDescription = "Account Profile",
                    tint = if (userState.isAuthenticated && !userState.isAnonymous) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = if (userState.isAuthenticated && !userState.isAnonymous) (userState.displayName?.take(10) ?: "User") else "Guest",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = if (userState.isAuthenticated && !userState.isAnonymous) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

private data class Quadruple<A, B, C, D>(val first: A, val second: B, val third: C, val fourth: D)
