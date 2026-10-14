/**
 * @file: ScanAccessCoordinator.kt
 * @class: Class 1 (Focused Logic Component)
 * @cap: 150 Lines
 * @responsibility:
 * Resolve whether a user may begin a scan and route the request through the
 * rewarded-ad gate. Only the tester account and the Professional tier skip
 * the ad.
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
 * Ad revenue offsets API cost and funds the future budget. Everyone watches a
 * rewarded ad to completion before EVERY scan, except the tester account and
 * the Professional tier. The proof is server-verified: the ad
 * carries a single-use ticket that Google reports to admobSsv on reward, and
 * the scan request presents that ticket (functions/adGate.js). Subscribers
 * only: when AdMob has no ad to show (no fill), the scan proceeds flagged
 * adNoFill so a paying customer is never blocked by ad supply.
 *
 * The server owns quota: it counts the free weekly scan and the subscription
 * bucket at its gate. This component only decides what to ask for.
 */

package com.fouroneone.scanner

import android.app.Activity
import android.content.Context

/** What the scan request carries as proof of the ad gate. */
sealed class AdProof {
    /** Tester / Professional: no ad. */
    object None : AdProof()

    /** Ad watched to the reward; the server matches this ticket via SSV. */
    data class Ticket(val adTicket: String) : AdProof()

    /** Subscriber only: AdMob had no ad to show. Logged server-side. */
    object NoFill : AdProof()
}

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
     * @param onGateFailed invoked with a 5-digit failure code when the ad
     * gate does not complete. The scan must not execute.
     */
    suspend fun requestAuthorization(
        context: Context,
        quotaStatus: QuotaStatus,
        onAuthorized: (AdProof) -> Unit,
        onPaywallRequired: () -> Unit,
        onGateFailed: (code5: String) -> Unit
    ) {
        // Tester and Professional: never shown an ad. The server skips the
        // gate for both on its own entitlement read.
        if (quotaStatus.isTesterUnlimited || quotaStatus.serverQuota?.isProfessional == true) {
            onAuthorized(AdProof.None)
            return
        }

        /*
         * Server quota is re-read right before authorization so a stale
         * Compose snapshot cannot send someone through an ad they can't
         * use. The server re-checks at its gate either way.
         */
        if (!QuotaManager.canPerformScan(context)) {
            onPaywallRequired()
            return
        }

        // The ad must be tied to a real Firebase uid (anonymous is fine);
        // the local guest fallback has none, so its ad could never verify.
        val user = AuthManager.userState.value
        if (!user.isAuthenticated || user.uid.isBlank()) {
            onGateFailed("80101")
            return
        }

        val activity = context as? Activity
        val subscriber = quotaStatus.isSubscriber
        if (activity == null) {
            if (subscriber) onAuthorized(AdProof.NoFill) else onGateFailed("60102")
            return
        }

        AdManager.showRewardedGate(
            activity = activity,
            userId = user.uid,
            onRewardEarned = { adTicket -> onAuthorized(AdProof.Ticket(adTicket)) },
            onAdUnavailable = {
                if (subscriber) onAuthorized(AdProof.NoFill) else onGateFailed("60102")
            },
            // Everyone, subscribers included, must finish the ad.
            onAdDismissedEarly = { onGateFailed("60102") }
        )
    }
}
