/**
 * @file: ScanAccessCoordinator.kt
 * @class: Class 1 (Focused Logic Component)
 * @cap: 150 Lines
 * @responsibility:
 * Resolve whether a user may begin a scan and route the request through the
 * existing free-scan, rental-pass, lifetime, and rewarded-ad access rules.
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
     */
    suspend fun requestAuthorization(
        context: Context,
        quotaStatus: QuotaStatus,
        onAuthorized: () -> Unit,
        onPaywallRequired: () -> Unit
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
             * Lifetime access never requires the rewarded-ad gate.
             */
            quotaStatus.isLifetimeUnlocked -> {
                onAuthorized()
            }

            /*
             * Active rental users receive the established cadence:
             * two ungated scans followed by one rewarded-ad opportunity.
             */
            quotaStatus.isUnlimited -> {
                val shouldShowAd =
                    QuotaManager.shouldShowAdForRental(
                        context
                    )

                if (
                    shouldShowAd &&
                    activity != null
                ) {
                    showRewardedGate(
                        activity = activity,
                        onAuthorized = onAuthorized
                    )
                } else {
                    onAuthorized()
                }
            }

            /*
             * Standard free-tier scans retain the existing rewarded gate.
             *
             * If an Activity is unavailable, preserve current production
             * behavior and allow the scan rather than dead-ending the user.
             */
            else -> {
                if (activity != null) {
                    showRewardedGate(
                        activity = activity,
                        onAuthorized = onAuthorized
                    )
                } else {
                    onAuthorized()
                }
            }
        }
    }

    /**
     * Keeps the rewarded-ad callback policy in one place.
     *
     * Existing V1 behavior authorizes the scan both when the reward is earned
     * and when the ad provider reports that an ad is unavailable.
     */
    private fun showRewardedGate(
        activity: Activity,
        onAuthorized: () -> Unit
    ) {
        AdManager.showRewardedGate(
            activity = activity,
            onRewardEarned = {
                onAuthorized()
            },
            onAdUnavailable = {
                onAuthorized()
            }
        )
    }
}
