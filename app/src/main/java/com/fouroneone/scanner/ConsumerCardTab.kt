package com.fouroneone.scanner

import androidx.compose.animation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.FactCheck
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Consumer Card Tab rendering target summary, Action Meter, 6-vector matrix, Bottom Line,
 * and "Would You Like to Know More?" deep-dive diagnostic expander.
 */
@Composable
fun ConsumerCardTab(consumerCard: ConsumerCard, modifier: Modifier = Modifier) {
    var isExpanded by remember { mutableStateOf(false) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        TargetIdentityCard(targetName = consumerCard.targetName, developerOrEntity = consumerCard.developerOrEntity)
        Spacer(modifier = Modifier.height(16.dp))
        ActionMeter(score = consumerCard.actionMeterScore, verdictBadge = consumerCard.actionVerdictBadge)
        Spacer(modifier = Modifier.height(16.dp))
        SixVectorDiagnosticGrid(metrics = consumerCard.metrics, annotations = consumerCard.metricAnnotations)
        Spacer(modifier = Modifier.height(16.dp))
        The411BottomLineCard(bottomLine = consumerCard.the411BottomLine)
        Spacer(modifier = Modifier.height(12.dp))

        OutlinedButton(
            onClick = { isExpanded = !isExpanded },
            modifier = Modifier.fillMaxWidth().testTag("would_you_like_to_know_more_button"),
            shape = RoundedCornerShape(10.dp)
        ) {
            Icon(
                imageVector = if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                contentDescription = null,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = if (isExpanded) "HIDE DEEP-DIVE ANALYSIS" else "🔘 WOULD YOU LIKE TO KNOW MORE?",
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.labelLarge
            )
        }

        AnimatedVisibility(
            visible = isExpanded,
            enter = fadeIn() + expandVertically(),
            exit = fadeOut() + shrinkVertically()
        ) {
            Column {
                Spacer(modifier = Modifier.height(12.dp))
                DeepDiveAnalysisCard(annotations = consumerCard.metricAnnotations, deepDiveText = consumerCard.deepDiveAnalysis)
            }
        }
        Spacer(modifier = Modifier.height(24.dp))
    }
}

@Composable
fun TargetIdentityCard(targetName: String, developerOrEntity: String, modifier: Modifier = Modifier) {
    ElevatedCard(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = targetName.ifBlank { "Unknown Target" },
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Spacer(modifier = Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(text = "Entity: ", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.outline)
                Text(text = developerOrEntity.ifBlank { "Not Identified" }, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

@Composable
fun The411BottomLineCard(bottomLine: String, modifier: Modifier = Modifier) {
    ElevatedCard(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = "THE 411 BOTTOM LINE", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            Spacer(modifier = Modifier.height(6.dp))
            Text(text = bottomLine.ifBlank { "No bottom line summary provided." }, style = MaterialTheme.typography.bodyMedium, lineHeight = 20.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
fun DeepDiveAnalysisCard(annotations: MetricAnnotations, deepDiveText: String?, modifier: Modifier = Modifier) {
    OutlinedCard(
        modifier = modifier.fillMaxWidth().testTag("deep_dive_analysis_card"),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.outlinedCardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f))
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(imageVector = Icons.Default.FactCheck, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(text = "DEEP-DIVE FORENSIC DOSSIER", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            }
            Spacer(modifier = Modifier.height(10.dp))
            if (!deepDiveText.isNullOrBlank()) {
                Text(text = deepDiveText, style = MaterialTheme.typography.bodyMedium, lineHeight = 20.sp, color = MaterialTheme.colorScheme.onSurface)
                Spacer(modifier = Modifier.height(12.dp))
            }
            val notes = listOfNotNull(
                annotations.financialRiskNote.takeIf { it.isNotBlank() }?.let { "• Financial Risk: $it" },
                annotations.personalDataNote.takeIf { it.isNotBlank() }?.let { "• Privacy & Data: $it" },
                annotations.wastedTimeNote.takeIf { it.isNotBlank() }?.let { "• Ads & Engagement: $it" },
                annotations.realSubstanceNote.takeIf { it.isNotBlank() }?.let { "• Functional Value: $it" },
                annotations.offlineIndependenceNote.takeIf { it.isNotBlank() }?.let { "• Offline Reliability: $it" },
                annotations.honestPricingNote.takeIf { it.isNotBlank() }?.let { "• Pricing Transparency: $it" }
            )
            if (notes.isNotEmpty()) {
                notes.forEach { note ->
                    Text(text = note, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 2.dp))
                }
            } else if (deepDiveText.isNullOrBlank()) {
                Text(text = "All vector mechanics operating within standard baseline parameters.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline)
            }
        }
    }
}
