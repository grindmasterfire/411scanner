package com.fouroneone.scanner

import android.app.Activity
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.HourglassTop
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

/**
 * Paywall Modal Bottom Sheet presenting all 7 subscription tiers.
 * Fallback prices match the locked 2026-10-06 spec; live prices come from Play.
 */
private data class PaywallTier(
    val productId: String,
    val title: String,
    val fallbackPrice: String,
    val subtitle: String,
    val icon: ImageVector,
    val testTag: String,
    val actionLabel: String,
)

private val PAYWALL_TIERS = listOf(
    PaywallTier(
        BillingManager.PRODUCT_STANDARD_WEEKLY,
        "Rental \u2022 7 days", "$3.99 / week",
        "7 scans over 7 days. The short-term pass.",
        Icons.Default.HourglassTop, "paywall_tier_rental", "Start Rental Week"
    ),
    PaywallTier(
        BillingManager.PRODUCT_STANDARD_MONTHLY,
        "Standard Monthly \u2022 Best value", "$12.99 / month",
        "30 scans each month. The everyday plan.",
        Icons.Default.CalendarMonth, "paywall_tier_standard_monthly", "Subscribe Monthly"
    ),
    PaywallTier(
        BillingManager.PRODUCT_STANDARD_ANNUAL,
        "Standard Annual \u2022 2 months free", "$129.99 / year",
        "360 scans a year at the lowest Standard rate.",
        Icons.Default.CalendarMonth, "paywall_tier_standard_annual", "Subscribe Annual"
    ),
    PaywallTier(
        BillingManager.PRODUCT_PRO_MONTHLY,
        "Pro Monthly", "$24.99 / month",
        "60 scans each month. For heavy users.",
        Icons.Default.CalendarMonth, "paywall_tier_pro_monthly", "Subscribe Pro Monthly"
    ),
    PaywallTier(
        BillingManager.PRODUCT_PRO_ANNUAL,
        "Pro Annual", "$249.99 / year",
        "720 scans a year. Maximum power.",
        Icons.Default.CalendarMonth, "paywall_tier_pro_annual", "Subscribe Pro Annual"
    ),
    PaywallTier(
        BillingManager.PRODUCT_FAMILY_MONTHLY,
        "Family Monthly", "$19.99 / month",
        "40 shared scans a month, up to 4 seats.",
        Icons.Default.Group, "paywall_tier_family_monthly", "Subscribe Family Monthly"
    ),
    PaywallTier(
        BillingManager.PRODUCT_FAMILY_ANNUAL,
        "Family Annual", "$199.99 / year",
        "480 shared scans a year, up to 4 seats.",
        Icons.Default.Group, "paywall_tier_family_annual", "Subscribe Family Annual"
    ),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaywallModal(
    onDismiss: () -> Unit,
    onFallbackGrant: (productId: String) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val productDetails by BillingManager.productDetailsMap.collectAsState()
    fun priceOf(id: String, fallback: String): String =
        productDetails[id]?.subscriptionOfferDetails?.firstOrNull()
            ?.pricingPhases?.pricingPhaseList?.firstOrNull()?.formattedPrice ?: fallback
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var selectedProductId by remember { mutableStateOf(BillingManager.PRODUCT_STANDARD_MONTHLY) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        modifier = modifier.testTag("paywall_modal_bottom_sheet")
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = 36.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = Icons.Default.Shield,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(44.dp)
            )

            Spacer(modifier = Modifier.height(10.dp))

            Text(
                text = "Weekly Free Scan Used",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = "You've used your free weekly scan. Pick a plan for a bucket of diagnostic scans.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(16.dp))

            PAYWALL_TIERS.forEachIndexed { index, tier ->
                TierSelectionCard(
                    title = tier.title,
                    price = priceOf(tier.productId, tier.fallbackPrice),
                    subtitle = tier.subtitle,
                    icon = tier.icon,
                    isSelected = selectedProductId == tier.productId,
                    onClick = { selectedProductId = tier.productId },
                    testTag = tier.testTag
                )
                if (index < PAYWALL_TIERS.lastIndex) Spacer(modifier = Modifier.height(10.dp))
            }

            Spacer(modifier = Modifier.height(20.dp))

            val selectedTier = PAYWALL_TIERS.first { it.productId == selectedProductId }

            Button(
                onClick = {
                    val activity = context as? Activity
                    if (activity != null) {
                        BillingManager.launchPurchase(activity, selectedProductId) {
                            onFallbackGrant(selectedProductId)
                        }
                    } else {
                        onFallbackGrant(selectedProductId)
                    }
                    onDismiss()
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
                    .testTag("paywall_action_button")
            ) {
                Text(text = selectedTier.actionLabel, fontWeight = FontWeight.Bold)
            }

            Spacer(modifier = Modifier.height(8.dp))

            OutlinedButton(
                onClick = onDismiss,
                modifier = Modifier.fillMaxWidth().testTag("paywall_cancel_button")
            ) {
                Text("Cancel / Wait Until Next Week")
            }
        }
    }
}

@Composable
private fun TierSelectionCard(
    title: String,
    price: String,
    subtitle: String,
    icon: ImageVector,
    isSelected: Boolean,
    onClick: () -> Unit,
    testTag: String
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable { onClick() }
            .testTag(testTag),
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f)
            else MaterialTheme.colorScheme.surfaceVariant
        ),
        border = if (isSelected) BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else null
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(28.dp)
            )

            Spacer(modifier = Modifier.width(14.dp))

            Column(modifier = Modifier.weight(1f)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = price,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                        maxLines = 1
                    )
                }
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}
