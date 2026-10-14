package com.fouroneone.scanner

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
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

        // Stopgap: the top-up bank, one line under the quota pill, until
        // the Plans screen redesign shows it properly.
        quotaStatus.topUpBalance?.let { balance ->
            Text(
                text = topUpBalanceLabel(balance),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .padding(top = 4.dp)
                    .testTag("topup_balance")
            )
        }
    }
}

internal fun topUpBalanceLabel(balance: TopUpBalance): String {
    val bank = if (balance.isFamilyBank) "Family top-up bank" else "Top-up bank"
    val noun = if (balance.scans == 1) "scan" else "scans"
    return "$bank: ${balance.scans} $noun"
}
