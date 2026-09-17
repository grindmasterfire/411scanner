/**
 * @file: ScanReportSectionParser.kt
 * @class: Class 2
 * @cap: 250 Lines
 * @responsibility: Parse 411 report sections while preserving legacy Cache Bank compatibility.
 * @dependencies: org.json.JSONArray, org.json.JSONObject
 * @security_gate: Read-only parsing. No network, scoring, persistence, or identity mutation.
 */

package com.fouroneone.scanner

import org.json.JSONArray
import org.json.JSONObject

object ScanReportSectionParser {

    fun parseConsumerCard(report: JSONObject): ConsumerCard {
        val card = report.optJSONObject("consumer_card") ?: JSONObject()
        val metrics = card.optJSONObject("metrics") ?: JSONObject()
        val notes = card.optJSONObject("metric_annotations") ?: JSONObject()

        return ConsumerCard(
            targetName = card.optString("target_name", "Unknown Target"),
            developerOrEntity = card.optString("developer_or_entity", "Not Identified"),
            interfaceSurface = card.optString("interface_surface", ""),
            classificationBadges = jsonArrayToList(card.optJSONArray("classification_badges")),
            metrics = Metrics(
                financialRisk = metrics.optInt("financial_risk", 0),
                personalDataExposure = metrics.optInt("personal_data_exposure", 0),
                wastedTimeAndAds = metrics.optInt("wasted_time_and_ads", 0),
                realSubstance = metrics.optInt("real_substance", 0),
                practicalUtility = canonicalOrLegacyInt(
                    metrics,
                    "practical_utility",
                    "offline_independence"
                ),
                honestBusinessModel = canonicalOrLegacyInt(
                    metrics,
                    "honest_business_model",
                    "honest_pricing"
                )
            ),
            metricAnnotations = MetricAnnotations(
                financialRiskNote = notes.optString("financial_risk_note", ""),
                personalDataNote = notes.optString("personal_data_note", ""),
                wastedTimeNote = notes.optString("wasted_time_note", ""),
                realSubstanceNote = notes.optString("real_substance_note", ""),
                practicalUtilityNote = canonicalOrLegacyString(
                    notes,
                    "practical_utility_note",
                    "offline_independence_note"
                ),
                honestBusinessModelNote = canonicalOrLegacyString(
                    notes,
                    "honest_business_model_note",
                    "honest_pricing_note"
                )
            ),
            actionMeterScore = card.optDouble("action_meter_score", 5.0),
            actionVerdictBadge = card.optString(
                "action_verdict_badge",
                "MOSTLY_EVERYBODY"
            ),
            verdictLabel = card.optString(
                "verdict_label",
                "MOSTLY EVERYBODY"
            ),
            tagline = card.optString("tagline", ""),
            essential411 = card.optString("essential_411", ""),
            secondaryTargetsNote = card.optString("secondary_targets_note", "")
        )
    }

    fun parseSolicitationIdentity(report: JSONObject): SolicitationIdentity {
        val source = report.optJSONObject("solicitation_identity") ?: JSONObject()

        return SolicitationIdentity(
            canonicalName = source.optString("canonical_name", ""),
            operator = source.optString("operator", ""),
            destinationDomain = source.optString("destination_domain", ""),
            destinationPath = source.optString("destination_path", ""),
            offerMechanic = source.optString("offer_mechanic", ""),
            confidence = source.optString("confidence", "unknown")
        )
    }

    fun parseSolicitationPattern(report: JSONObject): SolicitationPattern {
        val source = report.optJSONObject("solicitation_pattern") ?: JSONObject()

        return SolicitationPattern(
            solicitationType = source.optString("solicitation_type", ""),
            offerOrRequest = source.optString("offer_or_request", ""),
            requestedAction = source.optString("requested_action", ""),
            mechanics = jsonArrayToList(source.optJSONArray("mechanics")),
            behavioralSignals = jsonArrayToList(source.optJSONArray("behavioral_signals")),
            footprintStatus = source.optString("footprint_status", "unknown"),
            patternAssessment = source.optString(
                "pattern_assessment",
                "insufficient_evidence"
            ),
            confidence = source.optString("confidence", "unknown"),
            patternKey = source.optString("pattern_key", "")
        )
    }

    fun parseTechnicalLedger(report: JSONObject): TechnicalLedger {
        val ledger = report.optJSONObject("technical_ledger") ?: JSONObject()
        val network = ledger.optJSONObject("network_telemetry") ?: JSONObject()
        val money = ledger.optJSONObject("monetization") ?: JSONObject()
        val regulatory = ledger.optJSONObject("regulatory_record") ?: JSONObject()

        return TechnicalLedger(
            networkTelemetry = NetworkTelemetry(
                appPackageOrDomain = network.optString("app_package_or_domain", ""),
                hostCdn = network.optString("host_cdn", ""),
                domainAgeDays = nullableInt(network, "domain_age_days"),
                tlsCertificateStatus = nullableString(network, "tls_certificate_status"),
                groundingSources = jsonArrayToList(
                    network.optJSONArray("grounding_sources")
                )
            ),
            monetization = Monetization(
                revenueModel = money.optString("revenue_model", ""),
                pricing = money.optString("pricing", ""),
                affiliateDisclosure = money.optString("affiliate_disclosure", ""),
                guaranteeTerms = money.optString("guarantee_terms", "")
            ),
            regulatoryRecord = RegulatoryRecord(
                licenseStatus = regulatory.optString("license_status", ""),
                bbbRecord = regulatory.optString("bbb_record", ""),
                ftcRecord = regulatory.optString("ftc_record", ""),
                complaintPattern = regulatory.optString("complaint_pattern", ""),
                reviewSpread = regulatory.optString("review_spread", "")
            ),
            evidenceReceipts = parseEvidenceReceipts(
                ledger.optJSONArray("evidence_receipts")
            ),
            complaintPattern = ledger.optString("complaint_pattern", ""),
            reviewSpread = ledger.optString("review_spread", "")
        )
    }

    fun parseAlternatives(report: JSONObject): Alternatives {
        val source = report.optJSONObject("alternatives") ?: JSONObject()
        val links = source.optJSONObject("verified_links") ?: JSONObject()
        val discoveries = mutableListOf<Alternative>()
        val array = source.optJSONArray("discovery_items")

        if (array != null) {
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue

                discoveries.add(
                    Alternative(
                        name = item.optString("name", ""),
                        destinationUrl = item.optString("destination_url", ""),
                        relationship = item.optString("relationship", "other"),
                        description = item.optString("description", "")
                    )
                )
            }
        }

        return Alternatives(
            verifiedLinks = VerifiedLinks(
                officialSite = links.optString("official_site", ""),
                realPhone = links.optString("real_phone", ""),
                realEmail = links.optString("real_email", "")
            ),
            discoveryItems = discoveries
        )
    }

    fun parseTelemetry(root: JSONObject): ScanTelemetry? {
        val source = root.optJSONObject("telemetry") ?: return null

        return ScanTelemetry(
            operation = source.optString("operation", ""),
            model = source.optString("model", ""),
            promptTokenCount = source.optInt("promptTokenCount", 0),
            candidatesTokenCount = source.optInt("candidatesTokenCount", 0),
            totalTokenCount = source.optInt("totalTokenCount", 0),
            cachedContentTokenCount = source.optInt("cachedContentTokenCount", 0),
            thoughtsTokenCount = source.optInt("thoughtsTokenCount", 0),
            finishReason = nullableString(source, "finishReason")
        )
    }

    private fun parseEvidenceReceipts(
        array: JSONArray?
    ): List<TechnicalEvidenceReceipt> {
        if (array == null) return emptyList()

        val values = mutableListOf<TechnicalEvidenceReceipt>()

        for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: continue

            values.add(
                TechnicalEvidenceReceipt(
                    field = item.optString("field", ""),
                    status = item.optString("status", "not_researched"),
                    finding = item.optString("finding", ""),
                    authority = item.optString("authority", ""),
                    subject = item.optString("subject", ""),
                    identifier = item.optString("identifier", ""),
                    sourceUrl = item.optString("source_url", ""),
                    sourceTitle = item.optString("source_title", "")
                )
            )
        }

        return values
    }

    private fun canonicalOrLegacyInt(
        source: JSONObject,
        canonical: String,
        legacy: String
    ): Int =
        if (source.has(canonical)) {
            source.optInt(canonical, 0)
        } else {
            source.optInt(legacy, 0)
        }

    private fun canonicalOrLegacyString(
        source: JSONObject,
        canonical: String,
        legacy: String
    ): String =
        if (source.has(canonical)) {
            source.optString(canonical, "")
        } else {
            source.optString(legacy, "")
        }

    private fun nullableInt(source: JSONObject, key: String): Int? =
        if (source.isNull(key)) null else source.optInt(key)

    private fun nullableString(source: JSONObject, key: String): String? =
        if (source.isNull(key)) null else source.optString(key)

    private fun jsonArrayToList(array: JSONArray?): List<String> {
        if (array == null) return emptyList()

        val values = mutableListOf<String>()

        for (index in 0 until array.length()) {
            val value = array.optString(index)

            if (value.isNotBlank()) {
                values.add(value)
            }
        }

        return values
    }
}
