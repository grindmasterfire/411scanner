package com.fouroneone.scanner

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Top brand header and quota status display for 411 Scanner.
 */
@Composable
fun ScannerHeaderBranding(
    quotaStatus: QuotaStatus,
    modifier: Modifier = Modifier,
    onAuthClick: () -> Unit = {}
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(modifier = Modifier.height(20.dp))

        Icon(
            imageVector = Icons.Default.Shield,
            contentDescription = "411 Shield",
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(48.dp)
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "Diagnostic Evidence Scanner",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface
        )

        Spacer(modifier = Modifier.height(8.dp))

        QuotaHeaderBadge(quotaStatus = quotaStatus, onAuthClick = onAuthClick)
    }
}
