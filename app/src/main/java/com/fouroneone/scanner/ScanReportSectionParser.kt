/**
 * @file: ScanReportSectionParser.kt
 * @class: Class 2 (Standard Logic Component)
 * @cap: 250 Lines
 * @responsibility: Parse individual 411 Scanner report sections into Android data contracts.
 * @dependencies: org.json.JSONArray, org.json.JSONObject, ScanReport data contracts, ScanTelemetry
 * @security_gate: Read-only parsing. No network access, scoring mutation, persistence, or identity inference.
 * @owner_context: 411 Scanner Android production-response section parser.
 */

package com.fouroneone.scanner

import org.json.JSONArray
import org.json.JSONObject

object ScanReportSectionParser {

    /**
     * Parses the Consumer Card and six diagnostic vectors.
     *
     * offline_independence remains the V1 wire key for Practical Utility.
     */
    fun parseConsumerCard(report: JSONObject): ConsumerCard {
        val card = report.optJSONObject("consumer_card") ?: JSONObject()
        val source = card.optJSONObject("metrics") ?: JSONObject()
        val notes = card.optJSONObject("metric_annotations") ?: JSONObject()

        return ConsumerCard(
            targetName = card.optString("target_name", "Unknown Target"),
            developerOrEntity = card.optString("developer_or_entity", "Not Identified"),
            interfaceSurface = card.optString("interface_surface", ""),
            classificationBadges = jsonArrayToList(card.optJSONArray("classification_badges")),
            metrics = Metrics(
                financialRisk = source.optInt("financial_risk", 0),
                personalDataExposure = source.optInt("personal_data_exposure", 0),
                wastedTimeAndAds = source.optInt("wasted_time_and_ads", 0),
                realSubstance = source.optInt("real_substance", 0),
                practicalUtility = source.optInt("offline_independence", 0),
                honestPricing = source.optInt("honest_pricing", 0)
            ),
            metricAnnotations = MetricAnnotations(
                financialRiskNote = notes.optString("financial_risk_note", ""),
                personalDataNote = notes.optString("personal_data_note", ""),
                wastedTimeNote = notes.optString("wasted_time_note", ""),
                realSubstanceNote = notes.optString("real_substance_note", ""),
                practicalUtilityNote = notes.optString("offline_independence_note", ""),
                honestPricingNote = notes.optString("honest_pricing_note", "")
            ),
            actionMeterScore = card.optDouble("action_meter_score", 5.0),
            actionVerdictBadge = card.optString(
                "action_verdict_badge",
                "MOSTLY_FOR_EVERYONE"
            ),
            verdictLabel = card.optString(
                "verdict_label",
                "MOSTLY FOR EVERYONE"
            ),
            tagline = card.optString("tagline", ""),
            essential411 = card.optString("essential_411", ""),
            secondaryTargetsNote = card.optString("secondary_targets_note", "")
        )
    }

    /** Parses the resolved solicitation identity. */
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

    /** Parses evidence-supported solicitation-pattern classification. */
    fun parseSolicitationPattern(report: JSONObject): SolicitationPattern {
        val source = report.optJSONObject("solicitation_pattern") ?: JSONObject()

        return SolicitationPattern(
            solicitationType = source.optString("solicitation_type", ""),
            offerOrRequest = source.optString("offer_or_request", ""),
            requestedAction = source.optString("requested_action", ""),
            mechanics = jsonArrayToList(source.optJSONArray("mechanics")),
            behavioralSignals = jsonArrayToList(
                source.optJSONArray("behavioral_signals")
            ),
            footprintStatus = source.optString("footprint_status", "unknown"),
            patternAssessment = source.optString(
                "pattern_assessment",
                "insufficient_evidence"
            ),
            confidence = source.optString("confidence", "unknown"),
            patternKey = source.optString("pattern_key", "")
        )
    }

    /** Parses network, monetization, and regulatory evidence. */
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
            complaintPattern = ledger.optString("complaint_pattern", ""),
            reviewSpread = ledger.optString("review_spread", "")
        )
    }

    /** Parses verified links and recommended alternatives. */
    fun parseAlternatives(report: JSONObject): Alternatives {
        val source = report.optJSONObject("alternatives") ?: JSONObject()
        val links = source.optJSONObject("verified_links") ?: JSONObject()
        val recommendations = mutableListOf<Alternative>()
        val array = source.optJSONArray("recommended_alternatives")

        if (array != null) {
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                recommendations.add(
                    Alternative(
                        name = item.optString("name", ""),
                        scoreEstimate = item.optString("score_estimate", ""),
                        description = item.optString("description", "")
                    )
                )
            }
        }

        return Alternatives(
            renders = source.optBoolean("renders", false),
            verifiedLinks = VerifiedLinks(
                officialSite = links.optString("official_site", ""),
                realPhone = links.optString("real_phone", ""),
                realEmail = links.optString("real_email", "")
            ),
            recommendedAlternatives = recommendations,
            communityTags = jsonArrayToList(source.optJSONArray("community_tags"))
        )
    }

    /** Parses optional Gemini execution telemetry. */
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

    /** Preserves nullability for optional integer evidence fields. */
    private fun nullableInt(source: JSONObject, key: String): Int? =
        if (source.isNull(key)) null else source.optInt(key)

    /** Preserves nullability for optional string evidence fields. */
    private fun nullableString(source: JSONObject, key: String): String? =
        if (source.isNull(key)) null else source.optString(key)

    /** Converts an optional JSON string array into a clean Kotlin list. */
    private fun jsonArrayToList(array: JSONArray?): List<String> {
        if (array == null) return emptyList()

        val values = mutableListOf<String>()
        for (index in 0 until array.length()) {
            val value = array.optString(index)
            if (value.isNotBlank()) values.add(value)
        }
        return values
    }
}