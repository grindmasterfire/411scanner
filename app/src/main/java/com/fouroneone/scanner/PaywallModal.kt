package com.fouroneone.scanner

import android.app.Activity
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AllInclusive
import androidx.compose.material.icons.filled.CalendarMonth
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
import androidx.compose.ui.unit.dp

/**
 * Paywall Modal Bottom Sheet presenting Weekly, Monthly, and Lifetime Unlimited Passes.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaywallModal(
    onDismiss: () -> Unit,
    onGrantWeekly: () -> Unit,
    onGrantMonthly: () -> Unit,
    onGrantLifetime: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var selectedProductId by remember { mutableStateOf(BillingManager.PRODUCT_LIFETIME) }

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
                text = "Daily Free Scan Limit Reached",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = "You've used all 3 free daily diagnostic scans. Unlock unlimited instant evidence investigations.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(16.dp))

            TierSelectionCard(
                title = "Weekly Rental Pass",
                price = "$3.99 / week",
                subtitle = "Unlimited scans for 7 days. Ideal for quick short-term audits.",
                icon = Icons.Default.HourglassTop,
                isSelected = selectedProductId == BillingManager.PRODUCT_RENTAL_WEEKLY,
                onClick = { selectedProductId = BillingManager.PRODUCT_RENTAL_WEEKLY },
                testTag = "paywall_tier_weekly"
            )

            Spacer(modifier = Modifier.height(10.dp))

            TierSelectionCard(
                title = "Monthly Rental Pass",
                price = "$7.99 / month",
                subtitle = "Full 30-day continuous diagnostic and scam investigation access.",
                icon = Icons.Default.CalendarMonth,
                isSelected = selectedProductId == BillingManager.PRODUCT_RENTAL_MONTHLY,
                onClick = { selectedProductId = BillingManager.PRODUCT_RENTAL_MONTHLY },
                testTag = "paywall_tier_monthly"
            )

            Spacer(modifier = Modifier.height(10.dp))

            TierSelectionCard(
                title = "Lifetime Unlimited Pass",
                price = "$35.99 one-time",
                subtitle = "Permanent unlimited scans, priority grounding, zero ads forever.",
                icon = Icons.Default.AllInclusive,
                isSelected = selectedProductId == BillingManager.PRODUCT_LIFETIME,
                onClick = { selectedProductId = BillingManager.PRODUCT_LIFETIME },
                testTag = "paywall_tier_lifetime"
            )

            Spacer(modifier = Modifier.height(20.dp))

            val actionLabel = when (selectedProductId) {
                BillingManager.PRODUCT_RENTAL_WEEKLY -> "Unlock Weekly Pass • $3.99"
                BillingManager.PRODUCT_RENTAL_MONTHLY -> "Unlock Monthly Pass • $7.99"
                else -> "Unlock Lifetime Pass • $35.99"
            }

            Button(
                onClick = {
                    val activity = context as? Activity
                    val fallback = when (selectedProductId) {
                        BillingManager.PRODUCT_RENTAL_WEEKLY -> onGrantWeekly
                        BillingManager.PRODUCT_RENTAL_MONTHLY -> onGrantMonthly
                        else -> onGrantLifetime
                    }

                    if (activity != null) {
                        BillingManager.launchPurchase(activity, selectedProductId, fallback)
                    } else {
                        fallback()
                    }
                    onDismiss()
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
                    .testTag("paywall_action_button")
            ) {
                Text(text = actionLabel, fontWeight = FontWeight.Bold)
            }

            Spacer(modifier = Modifier.height(8.dp))

            OutlinedButton(
                onClick = onDismiss,
                modifier = Modifier.fillMaxWidth().testTag("paywall_cancel_button")
            ) {
                Text("Cancel / Wait Until Tomorrow")
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
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = price,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
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
