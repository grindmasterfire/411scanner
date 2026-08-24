package com.fouroneone.scanner

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Technical Ledger Tab rendering telemetry, SDK fingerprints, monetization mathematics,
 * regulatory violation mappings, and lazy-loaded forensic enrichment lookups.
 */
@Composable
fun TechnicalLedgerTab(
    ledger: TechnicalLedger,
    enrichedData: ForensicEnrichmentData? = null,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        ArchetypeBadgeHeader(badge = ledger.networkTelemetry.archetypeBadge)

        if (enrichedData != null) {
            Spacer(modifier = Modifier.height(14.dp))
            EnrichedForensicsCard(enrichedData)
        }

        Spacer(modifier = Modifier.height(14.dp))

        ForensicSection(title = "NETWORK & TELEMETRY") {
            MonospaceRow("Package/Domain", ledger.networkTelemetry.appPackageOrDomain.ifBlank { "N/A" })
            MonospaceRow("Host / CDN", ledger.networkTelemetry.hostCdn.ifBlank { "N/A" })
            MonospaceRow("Domain Age", ledger.networkTelemetry.domainAgeDays?.let { "$it days" } ?: "N/A")
            MonospaceRow("TLS Status", ledger.networkTelemetry.tlsCertificateStatus ?: "N/A")
            if (ledger.networkTelemetry.groundingSources.isNotEmpty()) {
                MonospaceRow("Grounding Sources", ledger.networkTelemetry.groundingSources.joinToString(", "))
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        ForensicSection(title = "SDK & CONTAINER FINGERPRINTS") {
            MonospaceRow("Container Type", ledger.sdkFingerprints.creativeContainerType.ifBlank { "N/A" })
            MonospaceRow("Tap Interception", ledger.sdkFingerprints.tapInterceptionBehavior.ifBlank { "N/A" })
            if (ledger.sdkFingerprints.adMediationNetworks.isNotEmpty()) {
                MonospaceRow("Ad Networks", ledger.sdkFingerprints.adMediationNetworks.joinToString(", "))
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        ForensicSection(title = "MONETIZATION MATHEMATICS") {
            MonospaceRow("Model", ledger.monetizationMathematics.monetizationModel.ifBlank { "N/A" })
            MonospaceRow("Effective Ad Load", ledger.monetizationMathematics.effectiveAdLoad.ifBlank { "N/A" })
            MonospaceRow("Decay Mechanic", if (ledger.monetizationMathematics.decayMechanicDetected) "DETECTED" else "None")
            MonospaceRow("Ad Views / Cost", ledger.monetizationMathematics.requiredAdViewsOrCost.ifBlank { "N/A" })
        }

        Spacer(modifier = Modifier.height(12.dp))

        ForensicSection(title = "REGULATORY & ENFORCEMENT") {
            MonospaceRow("Policy Violation", ledger.regulatoryCodes.primaryPolicyViolation.ifBlank { "None Detected" })
            MonospaceRow("FTC Rule Mapping", ledger.regulatoryCodes.ftcRuleMapping.ifBlank { "N/A" })
            MonospaceRow("Agency Endpoint", ledger.regulatoryCodes.enforcementAgencyEndpoint.ifBlank { "N/A" })
        }

        if (ledger.technicalFlags.isNotEmpty()) {
            Spacer(modifier = Modifier.height(12.dp))
            ForensicSection(title = "TECHNICAL FLAGS (${ledger.technicalFlags.size})") {
                ledger.technicalFlags.forEach { flag ->
                    Row(modifier = Modifier.padding(vertical = 2.dp)) {
                        Text(text = "• ", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error)
                        Text(text = flag, style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace, color = MaterialTheme.colorScheme.onSurface)
                    }
                }
            }
        }

        if (ledger.manifestPermissions.isNotEmpty()) {
            Spacer(modifier = Modifier.height(12.dp))
            ForensicSection(title = "MANIFEST PERMISSIONS") {
                ledger.manifestPermissions.forEach { perm ->
                    Text(text = perm, style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace, color = MaterialTheme.colorScheme.outline)
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))
    }
}

@Composable
private fun EnrichedForensicsCard(data: ForensicEnrichmentData) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1B5E20).copy(alpha = 0.08f)),
        border = BorderStroke(1.dp, Color(0xFF2E7D32)),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(imageVector = Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF2E7D32))
                Spacer(modifier = Modifier.width(6.dp))
                Text(text = "ENRICHED FORENSIC INTELLIGENCE (LIVE)", style = MaterialTheme.typography.labelSmall, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, color = Color(0xFF2E7D32))
            }
            Spacer(modifier = Modifier.height(8.dp))
            MonospaceRow("Domain Registrar", data.registrar)
            MonospaceRow("SSL Certificate", data.sslIssuer)
            MonospaceRow("Hosting Location", data.hostingCountry)
            MonospaceRow("BGP / ASN Route", data.asn)
            MonospaceRow("Original Registration", data.registrationDate)
        }
    }
}

@Composable
fun ArchetypeBadgeHeader(badge: String, modifier: Modifier = Modifier) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.primaryContainer,
        modifier = modifier.fillMaxWidth()
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(imageVector = Icons.Default.Info, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer)
            Spacer(modifier = Modifier.width(8.dp))
            Column {
                Text(text = "ARCHETYPE CLASSIFICATION", style = MaterialTheme.typography.labelSmall, fontFamily = FontFamily.Monospace, color = MaterialTheme.colorScheme.onPrimaryContainer)
                Text(text = badge.ifBlank { "VERIFIED_UTILITY" }, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace, color = MaterialTheme.colorScheme.onPrimaryContainer)
            }
        }
    }
}

@Composable
fun ForensicSection(title: String, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = CardDefaults.outlinedCardBorder(),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(text = title, style = MaterialTheme.typography.labelSmall, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            Spacer(modifier = Modifier.height(8.dp))
            content()
        }
    }
}

@Composable
fun MonospaceRow(label: String, value: String, modifier: Modifier = Modifier) {
    Row(modifier = modifier.fillMaxWidth().padding(vertical = 2.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(text = label, style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace, color = MaterialTheme.colorScheme.outline)
        Spacer(modifier = Modifier.width(8.dp))
        Text(text = value, style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f, fill = false))
    }
}
