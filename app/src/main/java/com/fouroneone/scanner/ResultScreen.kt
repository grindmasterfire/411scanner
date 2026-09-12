/**
 * @file: ResultScreen.kt
 * @class: Class 4 (Router/Layout)
 * @cap: 600 Lines
 * @responsibility: Own the diagnostic report shell and route the parsed report into its three result tabs.
 * @dependencies: Jetpack Compose Material 3, ScanReport, ConsumerCardTab, TechnicalLedgerTab, AlternativesTab
 * @security_gate: Presentation-only routing. No network calls, persistence, credential handling, or report mutation.
 * @owner_context: 411 Scanner result presentation after ScanReport parsing.
 */

package com.fouroneone.scanner

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Hosts the three diagnostic report views and keeps tab state local to the screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ResultScreen(
    report: ScanReport,
    onBackClick: () -> Unit,
    onRequestDeepDive: (suspend () -> String?)? = null
) {
    var selectedTabIndex by remember { mutableIntStateOf(0) }
    val tabs = listOf("Consumer Card", "Technical Ledger", "Alternatives")

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFFAFAFE))
            .statusBarsPadding()
    ) {
        TopAppBar(
            title = {
                Text(
                    text = "Diagnostic Report",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF1E1B2E)
                )
            },
            navigationIcon = {
                IconButton(onClick = onBackClick) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Back",
                        tint = Color(0xFF1E1B2E)
                    )
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = Color(0xFFFAFAFE)
            )
        )

        TabRow(
            selectedTabIndex = selectedTabIndex,
            containerColor = Color(0xFFFAFAFE),
            contentColor = Color(0xFF6750A4),
            indicator = { tabPositions ->
                TabRowDefaults.SecondaryIndicator(
                    Modifier.tabIndicatorOffset(tabPositions[selectedTabIndex]),
                    color = Color(0xFF6750A4)
                )
            }
        ) {
            tabs.forEachIndexed { index, title ->
                Tab(
                    selected = selectedTabIndex == index,
                    onClick = { selectedTabIndex = index },
                    text = {
                        Text(
                            text = title,
                            fontSize = 13.sp,
                            fontWeight = if (selectedTabIndex == index) {
                                FontWeight.Bold
                            } else {
                                FontWeight.Medium
                            },
                            color = if (selectedTabIndex == index) {
                                Color(0xFF6750A4)
                            } else {
                                Color(0xFF79747E)
                            }
                        )
                    }
                )
            }
        }

        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
        ) {
            when (selectedTabIndex) {
                0 -> ConsumerCardTab(
                    consumerCard = report.consumerCard,
                    telemetry = report.telemetry,
                    onRequestDeepDive = onRequestDeepDive
                )

                1 -> TechnicalLedgerTab(
                    consumerCard = report.consumerCard,
                    technicalLedger = report.technicalLedger
                )

                2 -> AlternativesTab(
                    consumerCard = report.consumerCard,
                    technicalLedger = report.technicalLedger,
                    alternatives = report.alternatives
                )
            }
        }
    }
}