/**
 * @file: TechnicalLedgerTab.kt
 * @class: Class 2 (Standard UI/Data Component)
 * @cap: 250 Lines
 *
 * @responsibility:
 * Render the technical evidence ledger for a completed 411 Scanner report.
 * Present network telemetry, monetization evidence, regulatory records,
 * complaint patterns, review spread, and source-inspection actions.
 *
 * @dependencies:
 * Android Intent
 * Android Uri
 * Jetpack Compose
 * Material 3
 * ConsumerCard
 * TechnicalLedger
 * ForensicUrlResolver
 *
 * @security_gate:
 * Read-only presentation layer.
 * Does not perform scoring, identity attribution, network requests,
 * persistence, solicitation-pattern generation, or evidence mutation.
 *
 * @owner_context:
 * 411 Scanner forensic technical ledger presentation.
 *
 * @t03_boundary:
 * Solicitation pattern identity is carried by ScanReport.solicitationPattern.
 * This tab does not reinterpret pattern evidence as actor identity.
 * Legacy technicalFlags are intentionally not referenced because they are
 * not part of the current TechnicalLedger contract.
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

/**
 * Technical evidence ledger for the completed diagnostic report.
 *
 * The tab intentionally consumes the existing TechnicalLedger contract.
 * T03 solicitation-pattern evidence remains a separate report-level object
 * and is not converted into generic technical flags here.
 */
@Composable
fun TechnicalLedgerTab(
    consumerCard: ConsumerCard?,
    technicalLedger: TechnicalLedger?
) {
    val context = LocalContext.current

    // Fail safely when the report contains no technical ledger.
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

    // Pull the established ledger sections into local references for readability.
    val nt = technicalLedger.networkTelemetry
    val mon = technicalLedger.monetization
    val reg = technicalLedger.regulatoryRecord

    // Classification badges remain sourced from the consumer-facing report object.
    val badges = consumerCard?.classificationBadges ?: emptyList()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(
                horizontal = 16.dp,
                vertical = 12.dp
            )
            .navigationBarsPadding(),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {

        // Display existing classification information when available.
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

        // Network and infrastructure evidence.
        LedgerCard(title = "NETWORK & TELEMETRY") {
            LedgerItem(
                "Package / Domain",
                nt.appPackageOrDomain.ifBlank {
                    "Not Identified"
                }
            )

            LedgerItem(
                "Host / CDN",
                nt.hostCdn.ifBlank {
                    "Unknown"
                }
            )

            LedgerItem(
                "Domain Age",
                nt.domainAgeDays?.let {
                    "$it days"
                } ?: "Unknown"
            )

            LedgerItem(
                "TLS Status",
                nt.tlsCertificateStatus ?: "Unknown"
            )

            // Only show grounding sources when the backend supplied them.
            if (nt.groundingSources.isNotEmpty()) {
                LedgerItem(
                    "Grounding Sources",
                    nt.groundingSources.joinToString("\n")
                )
            }
        }

        // Commercial and monetization evidence.
        LedgerCard(title = "MONETIZATION") {
            LedgerItem(
                "Revenue Model",
                mon.revenueModel.ifBlank {
                    "Unknown"
                }
            )

            LedgerItem(
                "Pricing",
                mon.pricing.ifBlank {
                    "Not disclosed"
                }
            )

            LedgerItem(
                "Affiliate Disclosure",
                mon.affiliateDisclosure.ifBlank {
                    "None"
                }
            )

            LedgerItem(
                "Guarantee / Refund",
                mon.guaranteeTerms.ifBlank {
                    "None stated"
                }
            )
        }

        // Regulatory and complaint evidence.
        LedgerCard(title = "REGULATORY & COMPLAINT RECORD") {
            LedgerItem(
                "License Status",
                reg.licenseStatus.ifBlank {
                    "Not verified"
                }
            )

            LedgerItem(
                "BBB Record",
                reg.bbbRecord.ifBlank {
                    "No record found"
                }
            )

            LedgerItem(
                "FTC Record",
                reg.ftcRecord.ifBlank {
                    "No record found"
                }
            )

            LedgerItem(
                "Complaint Pattern",
                reg.complaintPattern.ifBlank {
                    "None documented"
                }
            )

            LedgerItem(
                "Review Spread",
                reg.reviewSpread.ifBlank {
                    "No data"
                }
            )
        }

        /*
         * T03 boundary:
         *
         * Do not render a legacy "TECHNICAL FLAGS" section.
         *
         * TechnicalLedger no longer exposes technicalFlags.
         * Solicitation-pattern evidence has its own strongly typed
         * ScanReport.solicitationPattern contract and must not be
         * collapsed into an unrelated technical-flags collection.
         */

        // Resolve the source URL using the existing forensic resolver.
        val forensicUrl =
            ForensicUrlResolver.resolve(
                consumerCard,
                technicalLedger
            )

        // Preserve the existing severity threshold used by the report UI.
        val score =
            consumerCard?.actionMeterScore ?: 0.0

        val isSevereThreat =
            score >= 8.0

        /*
         * A report button is shown only when the existing FTC record
         * indicates an actual record rather than the default "No record"
         * placeholder.
         */
        val hasViolation =
            reg.ftcRecord.isNotBlank() &&
                !reg.ftcRecord.contains(
                    "No record",
                    ignoreCase = true
                )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {

            // Open the resolved forensic source for direct inspection.
            Button(
                onClick = {
                    context.startActivity(
                        Intent(
                            Intent.ACTION_VIEW,
                            Uri.parse(forensicUrl)
                        )
                    )
                },
                modifier = Modifier
                    .weight(1f)
                    .height(46.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFF1E1B2E)
                ),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(
                    Icons.Default.CheckCircle,
                    contentDescription = null,
                    tint = Color.White
                )

                Spacer(
                    modifier = Modifier.padding(
                        horizontal = 3.dp
                    )
                )

                Text(
                    "Inspect Source",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            /*
             * Preserve the existing reporting gate:
             * both a severe action-meter score and an identified FTC
             * record are required before presenting the report action.
             */
            if (isSevereThreat && hasViolation) {
                OutlinedButton(
                    onClick = {
                        context.startActivity(
                            Intent(
                                Intent.ACTION_VIEW,
                                Uri.parse(
                                    "https://reportfraud.ftc.gov/"
                                )
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
                        modifier = Modifier.padding(
                            horizontal = 2.dp
                        )
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

/**
 * Standard container used for individual technical-ledger sections.
 *
 * The content lambda is composable so callers can place LedgerItem
 * components directly inside the card.
 */
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

/**
 * Standard label/value renderer for technical evidence.
 *
 * Values are already grounded by the report parser. This component
 * performs presentation only and does not alter evidence semantics.
 */
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