/**
 * @file TechnicalEvidenceParser.kt
 * @class Class 1
 * @cap 220 Lines
 * @responsibility Parse Technical 411 evidence,
 * network, monetization, and regulatory data.
 */

package com.fouroneone.scanner

import org.json.JSONArray
import org.json.JSONObject

object TechnicalEvidenceParser {

    fun parseNetwork(
        ledger: JSONObject
    ): NetworkTelemetry {
        val source =
            ledger.optJSONObject("network_telemetry")
                ?: JSONObject()

        return NetworkTelemetry(
            appPackageOrDomain =
                source.optString(
                    "app_package_or_domain",
                    ""
                ),
            hostCdn =
                source.optString("host_cdn", ""),
            domainAgeDays =
                TechnicalJsonValues.nullableInt(
                    source,
                    "domain_age_days"
                ),
            tlsCertificateStatus =
                TechnicalJsonValues.nullableString(
                    source,
                    "tls_certificate_status"
                ),
            groundingSources =
                TechnicalJsonValues.stringList(
                    source.optJSONArray(
                        "grounding_sources"
                    )
                )
        )
    }

    fun parseMonetization(
        ledger: JSONObject
    ): Monetization {
        val source =
            ledger.optJSONObject("monetization")
                ?: JSONObject()

        return Monetization(
            revenueModel =
                source.optString("revenue_model", ""),
            pricing =
                source.optString("pricing", ""),
            affiliateDisclosure =
                source.optString(
                    "affiliate_disclosure",
                    ""
                ),
            guaranteeTerms =
                source.optString(
                    "guarantee_terms",
                    ""
                )
        )
    }

    fun parseRegulatory(
        ledger: JSONObject
    ): RegulatoryRecord {
        val source =
            ledger.optJSONObject("regulatory_record")
                ?: JSONObject()

        return RegulatoryRecord(
            licenseStatus =
                source.optString("license_status", ""),
            bbbRecord =
                source.optString("bbb_record", ""),
            ftcRecord =
                source.optString("ftc_record", ""),
            complaintPattern =
                source.optString(
                    "complaint_pattern",
                    ""
                ),
            reviewSpread =
                source.optString(
                    "review_spread",
                    ""
                )
        )
    }

    fun parseReceipts(
        array: JSONArray?
    ): List<TechnicalEvidenceReceipt> {
        if (array == null) return emptyList()

        val values =
            mutableListOf<TechnicalEvidenceReceipt>()

        for (index in 0 until array.length()) {
            val item =
                array.optJSONObject(index)
                    ?: continue

            values.add(
                TechnicalEvidenceReceipt(
                    field =
                        item.optString("field", ""),
                    status =
                        item.optString(
                            "status",
                            "not_researched"
                        ),
                    finding =
                        item.optString("finding", ""),
                    authority =
                        item.optString("authority", ""),
                    subject =
                        item.optString("subject", ""),
                    identifier =
                        item.optString("identifier", ""),
                    sourceUrl =
                        item.optString("source_url", ""),
                    sourceTitle =
                        item.optString("source_title", "")
                )
            )
        }

        return values
    }
}
