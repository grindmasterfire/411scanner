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
 * Free tier: one completed rewarded ad BEFORE the scan executes. No
 * completed ad, no scan — including when the ad is unavailable. The gate
 * never fails open.
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

        when {
            /*
             * Tester account and active subscribers: never ad-gated.
             */
            quotaStatus.isTesterUnlimited || quotaStatus.isUnlimited -> {
                onAuthorized()
            }

            /*
             * Free tier: the rewarded ad must COMPLETE before the scan.
             * Ad unavailable, ad dismissed early, or no Activity to show
             * it — all deny the scan. The gate never fails open.
             */
            else -> {
                if (activity != null) {
                    AdManager.showRewardedGate(
                        activity = activity,
                        onRewardEarned = {
                            onAuthorized()
                        },
                        onAdUnavailable = {
                            onGateFailed("60102")
                        }
                    )
                } else {
                    onGateFailed("60102")
                }
            }
        }
    }
}
