package com.fouroneone.scanner

import java.net.URLEncoder
import java.nio.charset.StandardCharsets

object ForensicUrlResolver {

    fun resolve(consumerCard: ConsumerCard?, technicalLedger: TechnicalLedger): String {
        val nt = technicalLedger.networkTelemetry
        val target = nt.appPackageOrDomain.trim()
        val badges = consumerCard?.classificationBadges?.joinToString(" ")?.uppercase() ?: ""

        // 1. Use a recognized forensic source from grounding if present
        val explicitSource = nt.groundingSources.firstOrNull { url ->
            url.contains("facebook.com/ads/library") ||
            url.contains("adstransparency.google.com") ||
            url.contains("exodus-privacy.eu.org") ||
            url.contains("opencorporates.com") ||
            url.contains("lookup.icann.org") ||
            url.contains("arkm.com") ||
            url.contains("etherscan.io")
        }
        if (explicitSource != null) return explicitSource

        // 2. Mobile app package -> Exodus Privacy
        if (target.startsWith("com.") && !target.contains(" ")) {
            return "https://reports.exodus-privacy.eu.org/en/reports/$target/latest/"
        }

        // 3. Ad / funnel classification -> Meta Ad Library
        if (badges.contains("AD") || badges.contains("FUNNEL") || badges.contains("ARBITRAGE") ||
            nt.hostCdn.contains("Meta", ignoreCase = true)) {
            val cleanQuery = target.replace(Regex("\\(.*?\\)"), "").trim()
            val query = URLEncoder.encode(cleanQuery.ifBlank { "sponsored" }, StandardCharsets.UTF_8.toString())
            return "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=$query"
        }

        // 4. Crypto / token classification -> Arkham or Etherscan
        if (badges.contains("CRYPTO") || badges.contains("DEFI") || badges.contains("TOKEN") ||
            target.startsWith("0x")) {
            return if (target.startsWith("0x") && target.length >= 40) {
                "https://etherscan.io/address/$target"
            } else {
                val query = URLEncoder.encode(target, StandardCharsets.UTF_8.toString())
                "https://intel.arkm.com/explorer/search?q=$query"
            }
        }

        // 5. Web domain -> ICANN registry lookup
        if (target.contains(".") && !target.contains(" ")) {
            val cleanDomain = target
                .removePrefix("http://")
                .removePrefix("https://")
                .trimEnd('/')
            return "https://lookup.icann.org/en/lookup?q=$cleanDomain"
        }

        // 6. Fallback -> OpenCorporates entity search
        val targetName = consumerCard?.targetName ?: target
        val entityQuery = targetName.replace(Regex("\\(.*?\\)"), "").trim()
        val query = URLEncoder.encode(entityQuery.ifBlank { "company" }, StandardCharsets.UTF_8.toString())
        return "https://opencorporates.com/companies?q=$query"
    }
}