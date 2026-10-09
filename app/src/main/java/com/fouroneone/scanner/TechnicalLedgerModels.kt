/**
 * @file TechnicalLedgerModels.kt
 * @class Class 2 (Data Contract)
 * @cap 250 Lines
 * @responsibility Android data contracts for Technical 411.
 * @dependencies None.
 * @security_gate Read-only report representation.
 * @owner_context 411 Scanner Technical 411.
 */

package com.fouroneone.scanner

data class TechnicalAttribution(
    val operatorName: String = "",
    val legalEntity: String = "",
    val developerOrPublisher: String = "",
    val storefrontName: String = "",
    val storefrontId: String = "",
    val packageOrBundleId: String = "",
    val officialDomain: String = "",
    val relatedDomains: List<String> = emptyList(),
    val relatedApps: List<String> = emptyList(),
    val contactEmails: List<String> = emptyList(),
    val contactPhones: List<String> = emptyList(),
    val businessAddresses: List<String> = emptyList(),
    val paymentProcessors: List<String> = emptyList(),
    val aliases: List<String> = emptyList(),
    val companyRegistrationIds: List<String> = emptyList(),
    val licenseIdentifiers: List<String> = emptyList()
)

data class DomainRegistration(
    val registrar: String = "",
    val registeredOn: String = "",
    val updatedOn: String = "",
    val expiresOn: String = "",
    val registrantName: String = "",
    val registrantOrganization: String = "",
    val registrantCountry: String = "",
    val nameservers: List<String> = emptyList()
)

data class TechnicalInfrastructure(
    val ipAddresses: List<String> = emptyList(),
    val asn: String = "",
    val hostingProvider: String = "",
    val cdn: String = "",
    val tlsIssuer: String = "",
    val tlsSubject: String = "",
    val tlsValidFrom: String = "",
    val tlsValidTo: String = ""
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
    val ftcRecord: String = "",
    val complaintPattern: String = "",
    val reviewSpread: String = ""
)

data class ConsumerEvidence(
    val bbbRecord: String = "",
    val trustpilot: String = "",
    val complaintPattern: String = "",
    val reviewSpread: String = "",
    val complaintBoards: List<String> = emptyList()
)

data class RedirectHop(
    val url: String = "",
    val statusCode: Int? = null,
    val hopIndex: Int = 0
)

data class RedirectPath(
    val submittedUrl: String = "",
    val normalizedUrl: String = "",
    val hops: List<RedirectHop> = emptyList(),
    val finalDestination: String = "",
    val finalDomain: String = "",
    val shortenerIdentity: String? = null,
    val trackingParameters: List<String> = emptyList()
)

data class TrackingIdentity(
    val trackingIds: Map<String, List<String>> = emptyMap(),
    val affiliateIdentifiers: List<String> = emptyList(),
    val packageHashes: List<String> = emptyList(),
    val sdkFingerprints: List<String> = emptyList()
)

data class DataRequirements(
    val accountRequirement: String = "",
    val kycRequirement: String = "",
    val personalDataCollection: String = "",
    val sensitiveDataCollection: String = "",
    val appPermissions: List<String> = emptyList()
)

data class CampaignContinuity(
    val reusedDomains: List<String> = emptyList(),
    val reusedTrackingIds: List<String> = emptyList(),
    val relatedOffers: List<String> = emptyList(),
    val confidence: String = ""
)

data class BlockchainEvidence(
    val walletAddresses: List<String> = emptyList(),
    val contractAddresses: List<String> = emptyList(),
    val chain: String = "",
    val tokenEvidence: String = ""
)

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
    val attribution: TechnicalAttribution =
        TechnicalAttribution(),
    val domainRegistration: DomainRegistration =
        DomainRegistration(),
    val infrastructure: TechnicalInfrastructure =
        TechnicalInfrastructure(),
    val networkTelemetry: NetworkTelemetry =
        NetworkTelemetry(),
    val monetization: Monetization =
        Monetization(),
    val regulatoryRecord: RegulatoryRecord =
        RegulatoryRecord(),
    val consumerEvidence: ConsumerEvidence =
        ConsumerEvidence(),
    val redirectPath: RedirectPath? =
        null,
    val trackingIdentity: TrackingIdentity =
        TrackingIdentity(),
    val dataRequirements: DataRequirements =
        DataRequirements(),
    val campaignContinuity: CampaignContinuity =
        CampaignContinuity(),
    val blockchainEvidence: BlockchainEvidence =
        BlockchainEvidence(),
    val evidenceReceipts: List<TechnicalEvidenceReceipt> =
        emptyList(),
    val technicalFlags: List<String> =
        emptyList(),
    val complaintPattern: String = "",
    val reviewSpread: String = ""
)
