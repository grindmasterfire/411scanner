package com.fouroneone.scanner

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

/**
 * Result Screen orchestrator displaying diagnostic output across 3 primary tabs
 * with lazy forensic enrichment and smart regulatory report dispatching.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ResultScreen(
    rawJson: String,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val report = remember(rawJson) { ScanReport.fromJson(rawJson) }
    var selectedTabIndex by remember { mutableIntStateOf(0) }
    val tabTitles = listOf("Consumer Card", "Technical Ledger", "Alternatives")

    var enrichmentState by remember { mutableStateOf<EnrichmentState>(EnrichmentState.Idle) }
    var enrichedData by remember { mutableStateOf<ForensicEnrichmentData?>(null) }

    fun triggerEnrichment() {
        if (enrichmentState is EnrichmentState.Loading) return
        enrichmentState = EnrichmentState.Loading
        coroutineScope.launch {
            try {
                val targetEntity = report?.consumerCard?.targetName ?: "TargetApp"
                val result = EnrichmentManager.fetchForensics(targetEntity)
                enrichedData = result
                enrichmentState = EnrichmentState.Success(result)
                selectedTabIndex = 1
            } catch (e: Exception) {
                enrichmentState = EnrichmentState.Error(e.message ?: "Enrichment failed")
            }
        }
    }

    fun submitFormalReport() {
        val target = report?.consumerCard?.targetName ?: "Target Entity"
        val domain = report?.technicalLedger?.networkTelemetry?.appPackageOrDomain ?: "N/A"
        val archetype = report?.technicalLedger?.networkTelemetry?.archetypeBadge ?: "SUSPICIOUS_ENTITY"
        val violation = report?.technicalLedger?.regulatoryCodes?.primaryPolicyViolation ?: "Unfair / Deceptive Trade Practice"
        val ftcRule = report?.technicalLedger?.regulatoryCodes?.ftcRuleMapping ?: "16 CFR Part 436"
        val endpoint = report?.technicalLedger?.regulatoryCodes?.enforcementAgencyEndpoint ?: ""

        val clipboardPayload = "Entity: $target | Target: $domain | Violation: $archetype | FTC Rule: $ftcRule | Issue: $violation"
        IntentHandler.copyToClipboard(context, "411 Forensic Report", clipboardPayload)
        Toast.makeText(context, "Report details copied to clipboard. Opening agency portal...", Toast.LENGTH_LONG).show()

        val portalUrl = IntentHandler.resolveAgencyUrl(endpoint, archetype)
        IntentHandler.launchAgencyPortal(context, portalUrl)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        TopAppBar(
            title = { Text(text = "Diagnostic Report", fontWeight = FontWeight.Bold) },
            navigationIcon = {
                IconButton(onClick = onDismiss, modifier = Modifier.testTag("dismiss_result_button")) {
                    Icon(imageVector = Icons.Default.ArrowBack, contentDescription = "Back to scan intake")
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            )
        )

        PrimaryTabRow(
            selectedTabIndex = selectedTabIndex,
            modifier = Modifier.fillMaxWidth()
        ) {
            tabTitles.forEachIndexed { index, title ->
                Tab(
                    selected = selectedTabIndex == index,
                    onClick = { selectedTabIndex = index },
                    text = {
                        Text(
                            text = title,
                            fontWeight = if (selectedTabIndex == index) FontWeight.Bold else FontWeight.Normal,
                            fontSize = 13.sp
                        )
                    },
                    modifier = Modifier.testTag("tab_$index")
                )
            }
        }

        Box(modifier = Modifier.weight(1f)) {
            if (report == null) {
                ReportParseErrorView(rawJson = rawJson)
            } else {
                when (selectedTabIndex) {
                    0 -> ConsumerCardTab(report.consumerCard)
                    1 -> TechnicalLedgerTab(report.technicalLedger, enrichedData = enrichedData)
                    2 -> AlternativesTab(report.alternativesAndLedger)
                }
            }
        }

        // Persistent Bottom Action Bar
        Surface(
            color = MaterialTheme.colorScheme.surfaceVariant,
            tonalElevation = 8.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Button(
                    onClick = { triggerEnrichment() },
                    modifier = Modifier.weight(1.2f),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                ) {
                    if (enrichmentState is EnrichmentState.Loading) {
                        CircularProgressIndicator(
                            color = Color.White,
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Inspecting...", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    } else {
                        Icon(imageVector = Icons.Default.Search, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(if (enrichedData != null) "Ledger Enriched" else "Inspect Ledger", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    }
                }

                OutlinedButton(
                    onClick = { submitFormalReport() },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(imageVector = Icons.Default.Flag, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Submit Report", color = MaterialTheme.colorScheme.error, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
fun ReportParseErrorView(rawJson: String, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.fillMaxSize().padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(imageVector = Icons.Default.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(48.dp))
            Spacer(modifier = Modifier.height(12.dp))
            Text(text = "Unable to parse diagnostic report.", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.error)
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = rawJson, style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace, modifier = Modifier.verticalScroll(rememberScrollState()).padding(16.dp))
        }
    }
}
