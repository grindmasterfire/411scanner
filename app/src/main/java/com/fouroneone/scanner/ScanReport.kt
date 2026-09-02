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
    val interfaceSurface: String = "",
    val classificationBadges: List<String> = emptyList(),
    val metrics: Metrics = Metrics(),
    val metricAnnotations: MetricAnnotations = MetricAnnotations(),
    val actionMeterScore: Double = 5.0,
    val actionVerdictBadge: String = "MOSTLY_FOR_EVERYONE",
    val verdictLabel: String = "MOSTLY FOR EVERYONE",
    val tagline: String = "",
    val essential411: String = "",
    val secondaryTargetsNote: String = ""
)

data class NetworkTelemetry(
    val appPackageOrDomain: String = "",
    val hostCdn: String = "",
    val domainAgeDays: Int? = null,
    val tlsCertificateStatus: String? = null,
    val groundingSources: List<String> = emptyList()
)

data class Monetization(
    val revenueModel: String = "",
    val pricing: String = "",
    val affiliateDisclosure: String = "",
    val guaranteeTerms: String = ""
)

data class RegulatoryRecord(
    val licenseStatus: String = "",
    val bbbRecord: String = "",
    val ftcRecord: String = "",
    val complaintPattern: String = "",
    val reviewSpread: String = ""
)

data class TechnicalLedger(
    val networkTelemetry: NetworkTelemetry = NetworkTelemetry(),
    val monetization: Monetization = Monetization(),
    val regulatoryRecord: RegulatoryRecord = RegulatoryRecord(),
    val technicalFlags: List<String> = emptyList()
)

data class Alternative(
    val name: String = "",
    val scoreEstimate: String = "",
    val description: String = ""
)

data class VerifiedLinks(
    val officialSite: String = "",
    val realPhone: String = "",
    val realEmail: String = ""
)

data class Alternatives(
    val renders: Boolean = false,
    val verifiedLinks: VerifiedLinks = VerifiedLinks(),
    val recommendedAlternatives: List<Alternative> = emptyList(),
    val communityTags: List<String> = emptyList()
)

data class ScanReport(
    val consumerCard: ConsumerCard = ConsumerCard(),
    val technicalLedger: TechnicalLedger = TechnicalLedger(),
    val alternatives: Alternatives = Alternatives()
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

                val badgesArray = ccObj.optJSONArray("classification_badges")
                val classificationBadges = jsonArrayToList(badgesArray)

                val consumerCard = ConsumerCard(
                    targetName = ccObj.optString("target_name", "Unknown Target"),
                    developerOrEntity = ccObj.optString("developer_or_entity", "Not Identified"),
                    interfaceSurface = ccObj.optString("interface_surface", ""),
                    classificationBadges = classificationBadges,
                    metrics = metrics,
                    metricAnnotations = metricNotes,
                    actionMeterScore = ccObj.optDouble("action_meter_score", 5.0),
                    actionVerdictBadge = ccObj.optString("action_verdict_badge", "MOSTLY_FOR_EVERYONE"),
                    verdictLabel = ccObj.optString("verdict_label", "MOSTLY FOR EVERYONE"),
                    tagline = ccObj.optString("tagline", ""),
                    essential411 = ccObj.optString("essential_411", ""),
                    secondaryTargetsNote = ccObj.optString("secondary_targets_note", "")
                )

                // Technical Ledger
                val tlObj = reportObj.optJSONObject("technical_ledger") ?: JSONObject()

                val ntObj = tlObj.optJSONObject("network_telemetry") ?: JSONObject()
                val networkTelemetry = NetworkTelemetry(
                    appPackageOrDomain = ntObj.optString("app_package_or_domain", ""),
                    hostCdn = ntObj.optString("host_cdn", ""),
                    domainAgeDays = if (!ntObj.isNull("domain_age_days")) ntObj.optInt("domain_age_days") else null,
                    tlsCertificateStatus = if (!ntObj.isNull("tls_certificate_status")) ntObj.optString("tls_certificate_status") else null,
                    groundingSources = jsonArrayToList(ntObj.optJSONArray("grounding_sources"))
                )

                val monObj = tlObj.optJSONObject("monetization") ?: JSONObject()
                val monetization = Monetization(
                    revenueModel = monObj.optString("revenue_model", ""),
                    pricing = monObj.optString("pricing", ""),
                    affiliateDisclosure = monObj.optString("affiliate_disclosure", ""),
                    guaranteeTerms = monObj.optString("guarantee_terms", "")
                )

                val regObj = tlObj.optJSONObject("regulatory_record") ?: JSONObject()
                val regulatoryRecord = RegulatoryRecord(
                    licenseStatus = regObj.optString("license_status", ""),
                    bbbRecord = regObj.optString("bbb_record", ""),
                    ftcRecord = regObj.optString("ftc_record", ""),
                    complaintPattern = regObj.optString("complaint_pattern", ""),
                    reviewSpread = regObj.optString("review_spread", "")
                )

                val technicalLedger = TechnicalLedger(
                    networkTelemetry = networkTelemetry,
                    monetization = monetization,
                    regulatoryRecord = regulatoryRecord,
                    technicalFlags = jsonArrayToList(tlObj.optJSONArray("technical_flags"))
                )

                // Alternatives
                val altObj = reportObj.optJSONObject("alternatives") ?: JSONObject()

                val linksObj = altObj.optJSONObject("verified_links") ?: JSONObject()
                val verifiedLinks = VerifiedLinks(
                    officialSite = linksObj.optString("official_site", ""),
                    realPhone = linksObj.optString("real_phone", ""),
                    realEmail = linksObj.optString("real_email", "")
                )

                val altArray = altObj.optJSONArray("recommended_alternatives")
                val recommendedAlternatives = mutableListOf<Alternative>()
                if (altArray != null) {
                    for (i in 0 until altArray.length()) {
                        val item = altArray.optJSONObject(i)
                        if (item != null) {
                            recommendedAlternatives.add(
                                Alternative(
                                    name = item.optString("name", ""),
                                    scoreEstimate = item.optString("score_estimate", ""),
                                    description = item.optString("description", "")
                                )
                            )
                        }
                    }
                }

                val alternatives = Alternatives(
                    renders = altObj.optBoolean("renders", false),
                    verifiedLinks = verifiedLinks,
                    recommendedAlternatives = recommendedAlternatives,
                    communityTags = jsonArrayToList(altObj.optJSONArray("community_tags"))
                )

                ScanReport(
                    consumerCard = consumerCard,
                    technicalLedger = technicalLedger,
                    alternatives = alternatives
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
                if (item.isNotBlank()) list.add(item)
            }
            return list
        }
    }
}