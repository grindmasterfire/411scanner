/**
 * @file: ForensicUrlResolver.kt
 * @class: Class 1
 * @cap: 150 Lines
 * @responsibility: Resolve the strongest inspectable source for Technical 411.
 * @security_gate: Prefer accepted evidence receipts and provider-grounded URLs over constructed lookup destinations.
 */

package com.fouroneone.scanner

import java.net.URLEncoder
import java.nio.charset.StandardCharsets

object ForensicUrlResolver {

    fun resolve(
        consumerCard: ConsumerCard?,
        technicalLedger: TechnicalLedger
    ): String {
        val verifiedReceipt =
            technicalLedger.evidenceReceipts.firstOrNull {
                it.status.equals("verified", ignoreCase = true) &&
                    it.sourceUrl.isNotBlank()
            }

        if (verifiedReceipt != null) {
            return verifiedReceipt.sourceUrl
        }

        val groundedSource =
            technicalLedger.networkTelemetry
                .groundingSources
                .firstOrNull {
                    it.startsWith("http://") ||
                        it.startsWith("https://")
                }

        if (groundedSource != null) {
            return groundedSource
        }

        /*
         * Legacy-cache fallback only.
         * New grounded reports should normally return above.
         */
        val nt = technicalLedger.networkTelemetry
        val target = nt.appPackageOrDomain.trim()
        val badges =
            consumerCard
                ?.classificationBadges
                ?.joinToString(" ")
                ?.uppercase() ?: ""

        if (
            target.startsWith("com.") &&
            !target.contains(" ")
        ) {
            return "https://reports.exodus-privacy.eu.org/en/reports/$target/latest/"
        }

        if (
            badges.contains("AD") ||
            badges.contains("FUNNEL") ||
            badges.contains("ARBITRAGE")
        ) {
            val query =
                URLEncoder.encode(
                    target.ifBlank { "sponsored" },
                    StandardCharsets.UTF_8.toString()
                )

            return "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=$query"
        }

        if (
            badges.contains("CRYPTO") ||
            badges.contains("DEFI") ||
            badges.contains("TOKEN") ||
            target.startsWith("0x")
        ) {
            if (
                target.startsWith("0x") &&
                target.length >= 40
            ) {
                return "https://etherscan.io/address/$target"
            }

            val query =
                URLEncoder.encode(
                    target,
                    StandardCharsets.UTF_8.toString()
                )

            return "https://intel.arkm.com/explorer/search?q=$query"
        }

        if (
            target.contains(".") &&
            !target.contains(" ")
        ) {
            val cleanDomain =
                target
                    .removePrefix("http://")
                    .removePrefix("https://")
                    .trimEnd('/')

            return "https://lookup.icann.org/en/lookup?q=$cleanDomain"
        }

        val targetName =
            consumerCard?.targetName
                ?: target

        val query =
            URLEncoder.encode(
                targetName.ifBlank { "company" },
                StandardCharsets.UTF_8.toString()
            )

        return "https://opencorporates.com/companies?q=$query"
    }
}
