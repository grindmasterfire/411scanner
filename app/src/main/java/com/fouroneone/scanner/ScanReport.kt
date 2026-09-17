/**
 * @file: ScanReport.kt
 * @class: Class 2
 * @cap: 250 Lines
 * @responsibility: Define the production scan report contract consumed by Android result screens.
 * @security_gate: Data contract only. No network access, scoring mutation, persistence, or identity inference.
 * @owner_context: 411 Scanner report contract between Firebase scan responses and Android result screens.
 */

package com.fouroneone.scanner

data class Metrics(
    val financialRisk: Int = 0,
    val personalDataExposure: Int = 0,
    val wastedTimeAndAds: Int = 0,
    val realSubstance: Int = 0,
    val practicalUtility: Int = 0,
    val honestBusinessModel: Int = 0
)

data class MetricAnnotations(
    val financialRiskNote: String = "",
    val personalDataNote: String = "",
    val wastedTimeNote: String = "",
    val realSubstanceNote: String = "",
    val practicalUtilityNote: String = "",
    val honestBusinessModelNote: String = ""
)

data class ConsumerCard(
    val targetName: String = "Unknown Target",
    val developerOrEntity: String = "Not Identified",
    val interfaceSurface: String = "",
    val classificationBadges: List<String> = emptyList(),
    val metrics: Metrics = Metrics(),
    val metricAnnotations: MetricAnnotations = MetricAnnotations(),
    val actionMeterScore: Double = 5.0,
    val actionVerdictBadge: String = "MOSTLY_EVERYBODY",
    val verdictLabel: String = "MOSTLY EVERYBODY",
    val tagline: String = "",
    val essential411: String = "",
    val secondaryTargetsNote: String = ""
)

data class SolicitationIdentity(
    val canonicalName: String = "",
    val operator: String = "",
    val destinationDomain: String = "",
    val destinationPath: String = "",
    val offerMechanic: String = "",
    val confidence: String = "unknown"
)

data class SolicitationPattern(
    val solicitationType: String = "",
    val offerOrRequest: String = "",
    val requestedAction: String = "",
    val mechanics: List<String> = emptyList(),
    val behavioralSignals: List<String> = emptyList(),
    val footprintStatus: String = "unknown",
    val patternAssessment: String = "insufficient_evidence",
    val confidence: String = "unknown",
    val patternKey: String = ""
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

/**
 * Machine-readable Technical 411 claim receipt.
 *
 * The backend accepts "verified" only when the proposed source survives
 * provider-grounding validation.
 */
data class TechnicalEvidenceReceipt(
    val field: String = "",
    val status: String = "not_researched",
    val finding: String = "",
    val authority: String = "",
    val subject: String = "",
    val identifier: String = "",
    val sourceUrl: String = "",
    val sourceTitle: String = ""
)

data class TechnicalLedger(
    val networkTelemetry: NetworkTelemetry = NetworkTelemetry(),
    val monetization: Monetization = Monetization(),
    val regulatoryRecord: RegulatoryRecord = RegulatoryRecord(),
    val evidenceReceipts: List<TechnicalEvidenceReceipt> = emptyList(),
    val complaintPattern: String = "",
    val reviewSpread: String = ""
)

data class Alternative(
    val name: String = "",
    val destinationUrl: String = "",
    val relationship: String = "other",
    val description: String = ""
)

data class VerifiedLinks(
    val officialSite: String = "",
    val realPhone: String = "",
    val realEmail: String = ""
)

data class Alternatives(
    val verifiedLinks: VerifiedLinks = VerifiedLinks(),
    val discoveryItems: List<Alternative> = emptyList()
)

data class ScanReport(
    val consumerCard: ConsumerCard = ConsumerCard(),
    val solicitationIdentity: SolicitationIdentity = SolicitationIdentity(),
    val solicitationPattern: SolicitationPattern = SolicitationPattern(),
    val technicalLedger: TechnicalLedger = TechnicalLedger(),
    val alternatives: Alternatives = Alternatives(),
    val telemetry: ScanTelemetry? = null,
    val cacheKey: String = ""
) {
    companion object {
        fun fromJson(jsonString: String): ScanReport? =
            ScanReportParser.fromJson(jsonString)
    }
}
