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

        LedgerCard("REGULATORY & COMPLAINT RECORD") {
            LedgerItem(
                "License Status",
                reg.licenseStatus.evidenceStateLabel()
            )

            LedgerItem(
                "BBB Record",
                reg.bbbRecord.evidenceStateLabel()
            )

            LedgerItem(
                "FTC Record",
                reg.ftcRecord.evidenceStateLabel()
            )

            LedgerItem(
                "Complaint Pattern",
                reg.complaintPattern.evidenceStateLabel()
            )

            LedgerItem(
                "Review Spread",
                reg.reviewSpread.evidenceStateLabel()
            )
        }

        TechnicalAttributionSection(
            technicalLedger
        )

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
