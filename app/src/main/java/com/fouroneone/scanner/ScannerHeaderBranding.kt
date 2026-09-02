package com.fouroneone.scanner

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Compact intake header displaying quota pills without bulky icon banners.
 */
@Composable
fun ScannerHeaderBranding(
    quotaStatus: QuotaStatus,
    onAuthClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = 8.dp, bottom = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        QuotaHeaderBadge(
            quotaStatus = quotaStatus,
            onAuthClick = onAuthClick
        )
    }
}