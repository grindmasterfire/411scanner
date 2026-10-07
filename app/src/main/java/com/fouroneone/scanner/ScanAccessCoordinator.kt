/**
 * @file: ScanAccessCoordinator.kt
 * @class: Class 1 (Focused Logic Component)
 * @cap: 150 Lines
 * @responsibility:
 * Resolve whether a user may begin a scan and route the request through the
 * free-tier rewarded-ad gate. Subscribers and the tester account are never
 * ad-gated.
 *
 * @dependencies:
 * Android Activity/Context, QuotaManager, QuotaStatus, AdManager.
 *
 * @security_gate:
 * This coordinator grants permission to begin a scan only. It does not
 * execute network requests, parse reports, consume scan quota, calculate
 * scores, or modify diagnostic evidence.
 *
 * @owner_context:
 * 411 Scanner production Android access and monetization gate.
 *
 * @critical_rule:
 * Ad revenue subsidizes the free weekly scan and adds to variable profit.
 * Everyone sees a rewarded ad before EVERY scan, except the tester account
 * and the future Professional tier (V1). Free tier: the ad must COMPLETE —
 * no completed ad, no scan. Subscribers: the ad is bonus revenue, not the
 * price of the scan — the scan proceeds once the ad completes or is
 * dismissed, and an unavailable ad never blocks a paying customer.
 *
 * Authorization and consumption are separate operations. This component may
 * authorize a scan, but only ScanExecutionWorkflow consumes quota after a
 * valid report has been delivered.
 */

package com.fouroneone.scanner

import android.app.Activity
import android.content.Context

/**
 * Centralizes the access decision that occurs before scan execution.
 *
 * Keeping this separate from ScannerMainScreen prevents the presentation
 * layer from owning monetization and entitlement branching.
 */
object ScanAccessCoordinator {

    /**
     * Resolves the current user's path into an authorized scan.
     *
     * The callbacks intentionally leave navigation and scan execution with
     * the caller while keeping entitlement rules centralized here.
     *
     * @param onGateFailed invoked with a 5-digit failure code when the free
     * tier's ad gate does not complete. The scan must not execute.
     */
    suspend fun requestAuthorization(
        context: Context,
        quotaStatus: QuotaStatus,
        onAuthorized: () -> Unit,
        onPaywallRequired: () -> Unit,
        onGateFailed: (code5: String) -> Unit
    ) {
        /*
         * DataStore is checked directly before authorization so an older
         * Compose snapshot cannot grant a scan after entitlement is gone.
         */
        val canPerformScan =
            QuotaManager.canPerformScan(context)

        if (!canPerformScan) {
            onPaywallRequired()
            return
        }

        val activity =
            context as? Activity

        // Tester account: never gated. (Professional tier (V1) will bypass
        // here too once the product exists.)
        if (quotaStatus.isTesterUnlimited) {
            onAuthorized()
            return
        }

        /*
         * Everyone else sees a rewarded ad before EVERY scan.
         *
         * Free tier: strict — the ad must complete. Dismissed early,
         * unavailable, or no Activity: the scan does not execute (60102).
         *
         * Subscribers: the ad is variable-profit revenue, not the price of
         * the scan. The scan proceeds after the ad completes or is
         * dismissed; an unavailable ad never blocks a paying customer.
         */
        if (activity != null) {
            if (quotaStatus.isUnlimited) {
                AdManager.showRewardedGate(
                    activity = activity,
                    onRewardEarned = { onAuthorized() },
                    onAdUnavailable = { onAuthorized() },
                    onAdDismissedEarly = { onAuthorized() }
                )
            } else {
                AdManager.showRewardedGate(
                    activity = activity,
                    onRewardEarned = { onAuthorized() },
                    onAdUnavailable = { onGateFailed("60102") }
                )
            }
        } else {
            if (quotaStatus.isUnlimited) onAuthorized() else onGateFailed("60102")
        }
    }
}
