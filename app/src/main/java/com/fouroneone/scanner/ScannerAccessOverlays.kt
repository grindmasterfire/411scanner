/**
 * @file: ScannerAccessOverlays.kt
 * @class: Class 1 (Focused UI Component)
 * @cap: 150 Lines
 * @responsibility:
 * Present scanner access overlays and execute the entitlement actions owned
 * by those overlays.
 *
 * @dependencies:
 * Compose, PaywallModal, AuthDialog, QuotaManager.
 *
 * @security_gate:
 * This component changes access entitlement only. It does not execute scans,
 * consume scan quota, establish solicitation identity, alter evidence, or
 * interact with Cache Bank intelligence.
 *
 * @owner_context:
 * 411 Scanner scanner-access presentation boundary.
 */

package com.fouroneone.scanner

import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.launch

@Composable
fun ScannerAccessOverlays(
    showPaywall: Boolean,
    showAuthDialog: Boolean,
    onDismissPaywall: () -> Unit,
    onDismissAuthDialog: () -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    if (showPaywall) {
        PaywallModal(
            onDismiss = onDismissPaywall,
            onFallbackGrant = { productId ->
                coroutineScope.launch {
                    // Interim device-side pass; the server writes the real
                    // scan-bucket entitlement. Annuals get 365 days — never
                    // a permanent unlock (no lifetime tier exists).
                    val hours = when (productId) {
                        BillingManager.PRODUCT_STANDARD_WEEKLY -> 24 * 7
                        BillingManager.PRODUCT_STANDARD_MONTHLY,
                        BillingManager.PRODUCT_PRO_MONTHLY,
                        BillingManager.PRODUCT_FAMILY_MONTHLY -> 24 * 30
                        else -> 24 * 365
                    }
                    QuotaManager.grantRentalPass(context, hours = hours)
                }
            }
        )
    }

    if (showAuthDialog) {
        AuthDialog(
            onDismiss = onDismissAuthDialog
        )
    }
}
