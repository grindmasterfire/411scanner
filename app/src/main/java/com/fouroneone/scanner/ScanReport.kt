package com.fouroneone.scanner

import org.json.JSONArray
import org.json.JSONObject

data class Metrics(
    val financialRisk: Int = 0,
    val personalDataExposure: Int = 0,
    val wastedTimeAndAds: Int = 0,
    val realSubstance: Int = 0,
    val offlineIndependence: Int = 0,
    val honestPricing: Int = 0
)

data class MetricAnnotations(
    val financialRiskNote: String = "",
    val personalDataNote: String = "",
    val wastedTimeNote: String = "",
    val realSubstanceNote: String = "",
    val offlineIndependenceNote: String = "",
    val honestPricingNote: String = ""
)

data class ConsumerCard(
    val targetName: String = "Unknown Target",
    val developerOrEntity: String = "Not Identified",
    val metrics: Metrics = Metrics(),
    val metricAnnotations: MetricAnnotations = MetricAnnotations(),
    val actionMeterScore: Double = 5.0,
    val actionVerdictBadge: String = "⚪ SOLID APP",
    val the411BottomLine: String = "",
    val deepDiveAnalysis: String? = null
)

data class NetworkTelemetry(
    val appPackageOrDomain: String = "",
    val hostCdn: String = "",
    val domainAgeDays: Int? = null,
    val tlsCertificateStatus: String? = null,
    val archetypeBadge: String = "CLEAN_INDIE",
    val groundingSources: List<String> = emptyList()
)

data class SdkFingerprints(
    val adMediationNetworks: List<String> = emptyList(),
    val creativeContainerType: String = "",
    val tapInterceptionBehavior: String = ""
)

data class MonetizationMathematics(
    val monetizationModel: String = "",
    val effectiveAdLoad: String = "",
    val decayMechanicDetected: Boolean = false,
    val requiredAdViewsOrCost: String = ""
)

data class RegulatoryCodes(
    val primaryPolicyViolation: String = "",
    val ftcRuleMapping: String = "",
    val enforcementAgencyEndpoint: String = ""
)

data class TechnicalLedger(
    val networkTelemetry: NetworkTelemetry = NetworkTelemetry(),
    val sdkFingerprints: SdkFingerprints = SdkFingerprints(),
    val manifestPermissions: List<String> = emptyList(),
    val monetizationMathematics: MonetizationMathematics = MonetizationMathematics(),
    val regulatoryCodes: RegulatoryCodes = RegulatoryCodes(),
    val technicalFlags: List<String> = emptyList()
)

data class AlternativesAndLedger(
    val recommendedAlternatives: List<String> = emptyList(),
    val communityTags: List<String> = emptyList()
)

data class ScanReport(
    val consumerCard: ConsumerCard = ConsumerCard(),
    val technicalLedger: TechnicalLedger = TechnicalLedger(),
    val alternativesAndLedger: AlternativesAndLedger = AlternativesAndLedger()
) {
    companion object {
        fun fromJson(jsonString: String): ScanReport? {
            return try {
                val root = JSONObject(jsonString)

                val reportObj = when {
                    root.has("report") -> root.getJSONObject("report")
                    root.has("result") && root.getJSONObject("result").has("report") ->
                        root.getJSONObject("result").getJSONObject("report")
                    root.has("result") && root.getJSONObject("result").has("consumer_card") ->
                        root.getJSONObject("result")
                    root.has("consumer_card") -> root
                    else -> root
                }

                // Consumer Card
                val ccObj = reportObj.optJSONObject("consumer_card") ?: JSONObject()
                val targetName = ccObj.optString("target_name", "Unknown Target")
                val devOrEntity = ccObj.optString("developer_or_entity", "Not Identified")
                val actionScore = ccObj.optDouble("action_meter_score", 5.0)
                val actionBadge = ccObj.optString("action_verdict_badge", "⚪ SOLID APP")
                val bottomLine = ccObj.optString("the411BottomLine", ccObj.optString("the_411_bottom_line", ""))
                val deepDive = if (ccObj.has("deep_dive_analysis") && !ccObj.isNull("deep_dive_analysis")) {
                    ccObj.optString("deep_dive_analysis")
                } else null

                val metricsObj = ccObj.optJSONObject("metrics") ?: JSONObject()
                val metrics = Metrics(
                    financialRisk = metricsObj.optInt("financial_risk", 0),
                    personalDataExposure = metricsObj.optInt("personal_data_exposure", 0),
                    wastedTimeAndAds = metricsObj.optInt("wasted_time_and_ads", 0),
                    realSubstance = metricsObj.optInt("real_substance", 0),
                    offlineIndependence = metricsObj.optInt("offline_independence", 0),
                    honestPricing = metricsObj.optInt("honest_pricing", 0)
                )

                val noteObj = ccObj.optJSONObject("metric_annotations") ?: JSONObject()
                val metricNotes = MetricAnnotations(
                    financialRiskNote = noteObj.optString("financial_risk_note", ""),
                    personalDataNote = noteObj.optString("personal_data_note", ""),
                    wastedTimeNote = noteObj.optString("wasted_time_note", ""),
                    realSubstanceNote = noteObj.optString("real_substance_note", ""),
                    offlineIndependenceNote = noteObj.optString("offline_independence_note", ""),
                    honestPricingNote = noteObj.optString("honest_pricing_note", "")
                )

                val consumerCard = ConsumerCard(
                    targetName = targetName,
                    developerOrEntity = devOrEntity,
                    metrics = metrics,
                    metricAnnotations = metricNotes,
                    actionMeterScore = actionScore,
                    actionVerdictBadge = actionBadge,
                    the411BottomLine = bottomLine,
                    deepDiveAnalysis = deepDive
                )

                // Technical Ledger
                val tlObj = reportObj.optJSONObject("technical_ledger") ?: JSONObject()

                val ntObj = tlObj.optJSONObject("network_telemetry") ?: JSONObject()
                val domainAge = if (ntObj.has("domain_age_days") && !ntObj.isNull("domain_age_days")) {
                    ntObj.optInt("domain_age_days")
                } else null
                val tlsStatus = if (ntObj.has("tls_certificate_status") && !ntObj.isNull("tls_certificate_status")) {
                    ntObj.optString("tls_certificate_status")
                } else null
                val networkTelemetry = NetworkTelemetry(
                    appPackageOrDomain = ntObj.optString("app_package_or_domain", ""),
                    hostCdn = ntObj.optString("host_cdn", ""),
                    domainAgeDays = domainAge,
                    tlsCertificateStatus = tlsStatus,
                    archetypeBadge = ntObj.optString("archetype_badge", "CLEAN_INDIE"),
                    groundingSources = jsonArrayToList(ntObj.optJSONArray("grounding_sources"))
                )

                val sdkObj = tlObj.optJSONObject("sdk_fingerprints") ?: JSONObject()
                val sdkFingerprints = SdkFingerprints(
                    adMediationNetworks = jsonArrayToList(sdkObj.optJSONArray("ad_mediation_networks")),
                    creativeContainerType = sdkObj.optString("creative_container_type", ""),
                    tapInterceptionBehavior = sdkObj.optString("tap_interception_behavior", "")
                )

                val manifestPermissions = jsonArrayToList(tlObj.optJSONArray("manifest_permissions"))

                val mmObj = tlObj.optJSONObject("monetization_mathematics") ?: JSONObject()
                val monetizationMath = MonetizationMathematics(
                    monetizationModel = mmObj.optString("monetization_model", ""),
                    effectiveAdLoad = mmObj.optString("effective_ad_load", ""),
                    decayMechanicDetected = mmObj.optBoolean("decay_mechanic_detected", false),
                    requiredAdViewsOrCost = mmObj.optString("required_ad_views_or_cost", "")
                )

                val regObj = tlObj.optJSONObject("regulatory_codes") ?: JSONObject()
                val regulatoryCodes = RegulatoryCodes(
                    primaryPolicyViolation = regObj.optString("primary_policy_violation", ""),
                    ftcRuleMapping = regObj.optString("ftc_rule_mapping", ""),
                    enforcementAgencyEndpoint = regObj.optString("enforcement_agency_endpoint", "")
                )

                val technicalFlags = jsonArrayToList(tlObj.optJSONArray("technical_flags"))

                val technicalLedger = TechnicalLedger(
                    networkTelemetry = networkTelemetry,
                    sdkFingerprints = sdkFingerprints,
                    manifestPermissions = manifestPermissions,
                    monetizationMathematics = monetizationMath,
                    regulatoryCodes = regulatoryCodes,
                    technicalFlags = technicalFlags
                )

                // Alternatives & Ledger
                val alObj = reportObj.optJSONObject("alternatives_and_ledger") ?: JSONObject()
                val alternativesAndLedger = AlternativesAndLedger(
                    recommendedAlternatives = jsonArrayToList(alObj.optJSONArray("recommended_alternatives")),
                    communityTags = jsonArrayToList(alObj.optJSONArray("community_tags"))
                )

                ScanReport(
                    consumerCard = consumerCard,
                    technicalLedger = technicalLedger,
                    alternativesAndLedger = alternativesAndLedger
                )
            } catch (e: Exception) {
                null
            }
        }

        private fun jsonArrayToList(array: JSONArray?): List<String> {
            if (array == null) return emptyList()
            val list = mutableListOf<String>()
            for (i in 0 until array.length()) {
                val item = array.optString(i)
                if (item.isNotBlank()) {
                    list.add(item)
                }
            }
            return list
        }
    }
}