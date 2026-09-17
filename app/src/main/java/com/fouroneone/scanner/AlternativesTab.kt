/**
 * @file: AlternativesTab.kt
 * @class: Class 3 (Feature Component)
 * @cap: 400 Lines
 * @responsibility:
 * Orchestrate T06 target access and discovery presentation from the
 * server-authoritative Action Meter.
 *
 * @dependencies:
 * Jetpack Compose Material 3, ConsumerCard, TechnicalLedger, Alternatives,
 * AlternativesUiSupport.
 *
 * @security_gate:
 * This screen never scores, vets, ranks, or researches alternatives.
 * Discovery cannot weaken the diagnostic or imply 411 endorsement.
 *
 * @owner_context:
 * 411 Scanner post-scan discovery and future monetization surface.
 *
 * T06 score territories:
 * - 0.0-5.5: preserve direct access to the scanned target.
 * - 5.6-7.9: expose useful discoveries around the apparent interest.
 * - 8.0+: keep the original warning while allowing broader discovery.
 *
 * Future mediation inventory belongs beside this presentation logic,
 * never inside the diagnostic or Action Meter calculation.
 */

package com.fouroneone.scanner

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.Icon
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
 * Main T06 feature surface.
 *
 * technicalLedger remains in the signature for ResultScreen compatibility.
 * T06 does not consume it because monetization evidence about the scanned
 * target must not be repurposed as alternative-selection authority.
 */
@Suppress("UNUSED_PARAMETER")
@Composable
fun AlternativesTab(
    consumerCard: ConsumerCard?,
    technicalLedger: TechnicalLedger?,
    alternatives: Alternatives?
) {
    val context = LocalContext.current

    if (alternatives == null) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "No discovery data available.",
                color = Color.Gray
            )
        }
        return
    }

    /*
     * This value was already calculated server-side.
     *
     * Android uses the score only to select the correct discovery
     * presentation. It does not recalculate or mutate the diagnosis.
     */
    val score =
        consumerCard?.actionMeterScore ?: 0.0

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(
                horizontal = 16.dp,
                vertical = 12.dp
            )
            .navigationBarsPadding(),
        verticalArrangement =
            Arrangement.spacedBy(16.dp)
    ) {
        when {
            score < 5.6 ->
                LowBandDiscovery(
                    alternatives = alternatives,
                    onOpenUrl = { url ->
                        openAlternativeUrl(
                            context,
                            url
                        )
                    },
                    onCall = { phone ->
                        openAlternativeDialer(
                            context,
                            phone
                        )
                    },
                    onEmail = { email ->
                        openAlternativeEmail(
                            context,
                            email
                        )
                    }
                )

            score < 8.0 ->
                DiscoveryBand(
                    title =
                        "EXPLORE THE TERRITORY",
                    explanation =
                        "This scan is in specialized territory. These are other opportunities or campaigns that surfaced naturally around the same interest. They are not 411 ratings or endorsements.",
                    alternatives = alternatives,
                    onOpenUrl = { url ->
                        openAlternativeUrl(
                            context,
                            url
                        )
                    }
                )

            else ->
                DiscoveryBand(
                    title =
                        "EXPLORE OTHER PATHS",
                    explanation =
                        "The scanned target is in high-action territory. These items are other paths or related interests discovered during the crawl. They are not presented as safer, better, or 411-approved.",
                    alternatives = alternatives,
                    onOpenUrl = { url ->
                        openAlternativeUrl(
                            context,
                            url
                        )
                    }
                )
        }

        Spacer(
            modifier = Modifier.height(16.dp)
        )
    }
}

/**
 * 0.0-5.5 means broader replacement discovery is unnecessary.
 *
 * Preserve direct access to contact points actually established during
 * the target's crawl. Future featured partner inventory can appear beside
 * this service without affecting the diagnosis.
 */
@Composable
private fun LowBandDiscovery(
    alternatives: Alternatives,
    onOpenUrl: (String) -> Unit,
    onCall: (String) -> Unit,
    onEmail: (String) -> Unit
) {
    GuidanceCard(
        title = "DIRECT ACCESS",
        text =
            "This scan is below the broader discovery threshold. Use the established contact points below to reach the scanned target directly. A featured partner opportunity may also appear here when inventory is available."
    )

    Text(
        text = "TARGET CONTACT POINTS",
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        color = Color(0xFF6750A4),
        letterSpacing = 0.8.sp
    )

    val links =
        alternatives.verifiedLinks

    var renderedContact =
        false

    if (links.officialSite.isNotBlank()) {
        renderedContact = true

        ContactCard(
            label = "Official Site",
            value = links.officialSite,
            onClick = {
                onOpenUrl(
                    links.officialSite
                )
            }
        )
    }

    if (links.realPhone.isNotBlank()) {
        renderedContact = true

        ContactCard(
            label = "Phone",
            value = links.realPhone,
            icon = {
                Icon(
                    imageVector =
                        Icons.Default.Phone,
                    contentDescription = null,
                    modifier =
                        Modifier.size(20.dp)
                )
            },
            onClick = {
                onCall(
                    links.realPhone
                )
            }
        )
    }

    if (links.realEmail.isNotBlank()) {
        renderedContact = true

        ContactCard(
            label = "Email",
            value = links.realEmail,
            icon = {
                Icon(
                    imageVector =
                        Icons.Default.Email,
                    contentDescription = null,
                    modifier =
                        Modifier.size(20.dp)
                )
            },
            onClick = {
                onEmail(
                    links.realEmail
                )
            }
        )
    }

    if (!renderedContact) {
        Text(
            text =
                "No direct contact point was established during this scan.",
            fontSize = 13.sp,
            color = Color.Gray
        )
    }
}

/**
 * 5.6+ discovery is broader than "better alternatives."
 *
 * Items may be comparative, complementary, adjacent, probabilistic,
 * or otherwise related to the interest surfaced by the scan.
 */
@Composable
private fun DiscoveryBand(
    title: String,
    explanation: String,
    alternatives: Alternatives,
    onOpenUrl: (String) -> Unit
) {
    GuidanceCard(
        title = title,
        text = explanation
    )

    if (alternatives.discoveryItems.isEmpty()) {
        Text(
            text =
                "No related opportunities surfaced naturally during this scan.",
            fontSize = 13.sp,
            color = Color.Gray
        )
        return
    }

    alternatives.discoveryItems.forEach { item ->
        DiscoveryCard(
            alternative = item,
            onOpenUrl = onOpenUrl
        )
    }
}
