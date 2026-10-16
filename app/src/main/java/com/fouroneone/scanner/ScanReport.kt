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
    val secondaryTargetsNote: String = "",
    /** Set when a required-infrastructure exception capped the meter. */
    val infrastructureException: InfrastructureException? = null,
    /** Where this violation gets reported, chosen by the server (8.5+). */
    val reportDestinations: List<ReportDestination> = emptyList()
)

/** One reporting door (fire 2026-10-16): an official agency or platform page. */
data class ReportDestination(
    val id: String,
    val label: String,
    val url: String,
    val why: String
)

/**
 * Server-applied required-infrastructure exception (ruling 2026-10-14):
 * the findings stand in full; only the action changed. The app never
 * reads the evidence-based score: every score decision (meter, report
 * button, tray) uses the final action_meter_score.
 */
data class InfrastructureException(
    val entity: String
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
    val cacheKey: String = ""
) {
    companion object {
        fun fromJson(jsonString: String): ScanReport? =
            ScanReportParser.fromJson(jsonString)
    }
}
