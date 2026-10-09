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

    fun parseConsumerEvidence(
        ledger: JSONObject
    ): ConsumerEvidence {
        val source =
            ledger.optJSONObject("consumer_evidence")
                ?: JSONObject()

        // Backwards compat: fall back to regulatory_record for old reports
        val legacy =
            ledger.optJSONObject("regulatory_record")
                ?: JSONObject()

        return ConsumerEvidence(
            bbbRecord =
                source.optString("bbb_record", "")
                    .ifEmpty { legacy.optString("bbb_record", "") },
            trustpilot =
                source.optString("trustpilot", ""),
            complaintPattern =
                source.optString("complaint_pattern", "")
                    .ifEmpty { legacy.optString("complaint_pattern", "") },
            reviewSpread =
                source.optString("review_spread", "")
                    .ifEmpty { legacy.optString("review_spread", "") },
            complaintBoards =
                TechnicalJsonValues.stringList(
                    source.optJSONArray("complaint_boards")
                )
        )
    }

    fun parseRedirectPath(
        ledger: JSONObject
    ): RedirectPath? {
        val source =
            ledger.optJSONObject("redirect_path")
                ?: return null

        val hopsArray = source.optJSONArray("hops")
        val hops = mutableListOf<RedirectHop>()
        if (hopsArray != null) {
            for (i in 0 until hopsArray.length()) {
                val h = hopsArray.optJSONObject(i) ?: continue
                hops.add(
                    RedirectHop(
                        url = h.optString("url", ""),
                        statusCode = if (h.isNull("status_code")) null
                                     else h.optInt("status_code"),
                        hopIndex = h.optInt("hop_index", i)
                    )
                )
            }
        }

        return RedirectPath(
            submittedUrl = source.optString("submitted_url", ""),
            normalizedUrl = source.optString("normalized_url", ""),
            hops = hops,
            finalDestination = source.optString("final_destination", ""),
            finalDomain = source.optString("final_domain", ""),
            shortenerIdentity = source.optString("shortener_identity", "")
                .ifEmpty { null },
            trackingParameters = TechnicalJsonValues.stringList(
                source.optJSONArray("tracking_parameters")
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
