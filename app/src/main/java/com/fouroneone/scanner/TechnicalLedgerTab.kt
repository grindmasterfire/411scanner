/**
 * @file: TechnicalLedgerTab.kt
 * @class: Class 3
 * @cap: 400 Lines
 * @responsibility: Render Technical 411 evidence, structured receipts, and source-inspection actions.
 * @security_gate: Read-only presentation. No scoring, evidence mutation, persistence, or network research.
 */

package com.fouroneone.scanner

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun TechnicalLedgerTab(
    consumerCard: ConsumerCard?,
    technicalLedger: TechnicalLedger?
) {
    val context = LocalContext.current

    if (technicalLedger == null) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Text(
                "No technical ledger available.",
                color = Color.Gray
            )
        }
        return
    }

    val nt = technicalLedger.networkTelemetry
    val mon = technicalLedger.monetization
    val reg = technicalLedger.regulatoryRecord
    val consumer = technicalLedger.consumerEvidence
    val redirectPath = technicalLedger.redirectPath
    val receipts = technicalLedger.evidenceReceipts
    val badges = consumerCard?.classificationBadges ?: emptyList()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .navigationBarsPadding(),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        if (badges.isNotEmpty()) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = Color(0xFFF3EDF7)
                ),
                shape = RoundedCornerShape(14.dp)
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Icon(
                        Icons.Default.Info,
                        contentDescription = null,
                        tint = Color(0xFF6750A4)
                    )

                    Column {
                        Text(
                            "CLASSIFICATION",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF6750A4)
                        )

                        Text(
                            badges.joinToString("  ·  "),
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Black,
                            color = Color(0xFF1E1B2E)
                        )
                    }
                }
            }
        }

        LedgerCard("NETWORK & TELEMETRY") {
            LedgerItem(
                "Package / Domain",
                nt.appPackageOrDomain.ifBlank { "Not established" }
            )

            LedgerItem(
                "Host / CDN",
                nt.hostCdn.ifBlank { "Not established" }
            )

            LedgerItem(
                "Domain Age",
                nt.domainAgeDays?.let { "$it days" }
                    ?: "Not established"
            )

            LedgerItem(
                "TLS Status",
                nt.tlsCertificateStatus
                    ?.takeIf { it.isNotBlank() }
                    ?: "Not established"
            )

            if (nt.groundingSources.isNotEmpty()) {
                LedgerItem(
                    "Grounded Sources",
                    "${nt.groundingSources.size} provider-confirmed source(s)"
                )
            }
        }

        LedgerCard("MONETIZATION") {
            LedgerItem(
                "Revenue Model",
                mon.revenueModel.ifBlank { "Not established" }
            )

            LedgerItem(
                "Pricing",
                mon.pricing.ifBlank { "Not established" }
            )

            LedgerItem(
                "Affiliate Disclosure",
                mon.affiliateDisclosure.ifBlank { "Not established" }
            )

            LedgerItem(
                "Guarantee / Refund",
                mon.guaranteeTerms.ifBlank { "Not established" }
            )
        }

        LedgerCard("REGULATORY RECORD") {
            LedgerItem(
                "License Status",
                reg.licenseStatus.evidenceStateLabel()
            )

            LedgerItem(
                "FTC Record",
                reg.ftcRecord.evidenceStateLabel()
            )
        }

        LedgerCard("CONSUMER EVIDENCE") {
            LedgerItem(
                "BBB Record",
                consumer.bbbRecord.evidenceStateLabel()
            )

            LedgerItem(
                "Trustpilot",
                consumer.trustpilot.evidenceStateLabel()
            )

            LedgerItem(
                "Complaint Pattern",
                consumer.complaintPattern.evidenceStateLabel()
            )

            LedgerItem(
                "Review Spread",
                consumer.reviewSpread.evidenceStateLabel()
            )

            if (consumer.complaintBoards.isNotEmpty()) {
                LedgerItem(
                    "Complaint Boards",
                    consumer.complaintBoards.joinToString(", ")
                )
            }
        }

        if (redirectPath != null && redirectPath.submittedUrl.isNotBlank()) {
            LedgerCard("REDIRECT PATH") {
                LedgerItem(
                    "Submitted URL",
                    redirectPath.submittedUrl
                )

                if (redirectPath.hops.isNotEmpty()) {
                    redirectPath.hops.forEach { hop ->
                        LedgerItem(
                            "Hop ${hop.hopIndex + 1}${hop.statusCode?.let { " ($it)" } ?: ""}",
                            hop.url.ifBlank { "—" }
                        )
                    }
                }

                LedgerItem(
                    "Final Destination",
                    redirectPath.finalDestination.ifBlank { "Not established" }
                )

                LedgerItem(
                    "Final Domain",
                    redirectPath.finalDomain.ifBlank { "Not established" }
                )

                redirectPath.shortenerIdentity?.let {
                    LedgerItem("Shortener", it)
                }

                if (redirectPath.trackingParameters.isNotEmpty()) {
                    LedgerItem(
                        "Tracking Parameters",
                        redirectPath.trackingParameters.joinToString(", ")
                    )
                }
            }
        }

        TechnicalAttributionSection(
            technicalLedger
        )

        // P4: Tracking Identity — only render when data exists
        val tracking = technicalLedger.trackingIdentity
        if (tracking.trackingIds.isNotEmpty() ||
            tracking.affiliateIdentifiers.isNotEmpty() ||
            tracking.packageHashes.isNotEmpty() ||
            tracking.sdkFingerprints.isNotEmpty()) {
            LedgerCard("TRACKING IDENTITY") {
                tracking.trackingIds.forEach { (name, ids) ->
                    if (ids.isNotEmpty()) {
                        LedgerItem(name, ids.joinToString(", "))
                    }
                }
                if (tracking.affiliateIdentifiers.isNotEmpty()) {
                    LedgerItem(
                        "Affiliate IDs",
                        tracking.affiliateIdentifiers.joinToString(", ")
                    )
                }
                if (tracking.packageHashes.isNotEmpty()) {
                    LedgerItem(
                        "Package Hashes",
                        tracking.packageHashes.joinToString(", ")
                    )
                }
                if (tracking.sdkFingerprints.isNotEmpty()) {
                    LedgerItem(
                        "SDK Fingerprints",
                        tracking.sdkFingerprints.joinToString(", ")
                    )
                }
            }
        }

        // P4: Data Requirements — only render when data exists
        val dataReq = technicalLedger.dataRequirements
        if (dataReq.accountRequirement.isNotBlank() ||
            dataReq.kycRequirement.isNotBlank() ||
            dataReq.personalDataCollection.isNotBlank() ||
            dataReq.sensitiveDataCollection.isNotBlank() ||
            dataReq.appPermissions.isNotEmpty()) {
            LedgerCard("DATA REQUIREMENTS") {
                if (dataReq.accountRequirement.isNotBlank()) {
                    LedgerItem("Account", dataReq.accountRequirement)
                }
                if (dataReq.kycRequirement.isNotBlank()) {
                    LedgerItem("KYC", dataReq.kycRequirement)
                }
                if (dataReq.personalDataCollection.isNotBlank()) {
                    LedgerItem("Personal Data", dataReq.personalDataCollection)
                }
                if (dataReq.sensitiveDataCollection.isNotBlank()) {
                    LedgerItem("Sensitive Data", dataReq.sensitiveDataCollection)
                }
                if (dataReq.appPermissions.isNotEmpty()) {
                    LedgerItem(
                        "Permissions",
                        dataReq.appPermissions.joinToString(", ")
                    )
                }
            }
        }

        // P4: Campaign Continuity — only render when data exists
        val campaign = technicalLedger.campaignContinuity
        if (campaign.reusedDomains.isNotEmpty() ||
            campaign.reusedTrackingIds.isNotEmpty() ||
            campaign.relatedOffers.isNotEmpty()) {
            LedgerCard("CAMPAIGN CONTINUITY") {
                if (campaign.confidence.isNotBlank()) {
                    LedgerItem("Confidence", campaign.confidence)
                }
                if (campaign.reusedDomains.isNotEmpty()) {
                    LedgerItem(
                        "Reused Domains",
                        campaign.reusedDomains.joinToString(", ")
                    )
                }
                if (campaign.reusedTrackingIds.isNotEmpty()) {
                    LedgerItem(
                        "Reused Tracking IDs",
                        campaign.reusedTrackingIds.joinToString(", ")
                    )
                }
                if (campaign.relatedOffers.isNotEmpty()) {
                    LedgerItem(
                        "Related Offers",
                        campaign.relatedOffers.joinToString(", ")
                    )
                }
            }
        }

        // P4: Blockchain — only render when data exists
        val chain = technicalLedger.blockchainEvidence
        if (chain.walletAddresses.isNotEmpty() ||
            chain.contractAddresses.isNotEmpty() ||
            chain.chain.isNotBlank() ||
            chain.tokenEvidence.isNotBlank()) {
            LedgerCard("BLOCKCHAIN") {
                if (chain.chain.isNotBlank()) {
                    LedgerItem("Chain", chain.chain)
                }
                if (chain.walletAddresses.isNotEmpty()) {
                    LedgerItem(
                        "Wallets",
                        chain.walletAddresses.joinToString(", ")
                    )
                }
                if (chain.contractAddresses.isNotEmpty()) {
                    LedgerItem(
                        "Contracts",
                        chain.contractAddresses.joinToString(", ")
                    )
                }
                if (chain.tokenEvidence.isNotBlank()) {
                    LedgerItem("Token Evidence", chain.tokenEvidence)
                }
            }
        }

        TechnicalEvidenceSection(
            receipts
        )

        val score =
            consumerCard?.actionMeterScore ?: 0.0

        val hasVerifiedFtcRecord =
            receipts.any {
                it.status.equals("verified", ignoreCase = true) &&
                    (
                        it.field.contains("ftc", ignoreCase = true) ||
                        it.authority.contains("FTC", ignoreCase = true)
                    )
            }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (
                score >= 8.5
            ) {
                OutlinedButton(
                    onClick = {
                        context.startActivity(
                            Intent(
                                Intent.ACTION_VIEW,
                                Uri.parse("https://reportfraud.ftc.gov/")
                            )
                        )
                    },
                    modifier = Modifier
                        .weight(1f)
                        .height(46.dp),
                    shape = RoundedCornerShape(10.dp),
                    border = BorderStroke(
                        1.dp,
                        Color(0xFFB3261E)
                    )
                ) {
                    Icon(
                        Icons.Default.Flag,
                        contentDescription = null,
                        tint = Color(0xFFB3261E)
                    )

                    Spacer(
                        modifier = Modifier.padding(horizontal = 2.dp)
                    )

                    Text(
                        "Report",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFB3261E)
                    )
                }
            }
        }

        Spacer(
            modifier = Modifier.height(16.dp)
        )
    }
}


private fun String.evidenceStateLabel():
    String =
    when (trim().lowercase()) {
        "" ->
            "Not established"

        "unresolved" ->
            "Unresolved"

        "not_found" ->
            "Not found"

        "not_researched" ->
            "Not researched"

        "not_applicable" ->
            "Not applicable"

        else ->
            this
    }

@Composable
private fun LedgerCard(
    title: String,
    content: @Composable () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color.White
        ),
        border = BorderStroke(
            1.dp,
            Color(0xFFE6E0E9)
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Text(
                text = title,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF6750A4),
                letterSpacing = 0.8.sp
            )

            Spacer(
                modifier = Modifier.height(12.dp)
            )

            content()
        }
    }
}

@Composable
private fun LedgerItem(
    label: String,
    value: String
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
    ) {
        Text(
            text = label,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            color = Color(0xFF79747E)
        )

        Spacer(
            modifier = Modifier.height(2.dp)
        )

        Text(
            text = value,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            color = Color(0xFF1E1B2E)
        )
    }
}
