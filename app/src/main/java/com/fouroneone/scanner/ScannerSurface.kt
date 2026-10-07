/**
 * @file: ScannerSurface.kt
 * @class: Class 2 (Standard UI Component)
 * @cap: 250 Lines
 * @responsibility:
 * Render the scanner intake surface from state supplied by its caller and
 * emit user actions through callbacks.
 *
 * @dependencies:
 * Jetpack Compose UI, ScannerHeaderBranding, ImagePreviewFrame,
 * CoinStarTicker, ScanControlsSection, RecentScansTray.
 *
 * @security_gate:
 * Presentation only. This file does not access repositories, DataStore,
 * billing, ads, quota mutation, Gemini, Cache Bank, or scoring logic.
 *
 * @owner_context:
 * 411 Scanner production Android scanner presentation surface.
 *
 * @architecture_rule:
 * ScannerSurface is deliberately stateless with respect to scan workflow.
 * It renders state and reports user intent; ScannerMainScreen owns session
 * orchestration.
 */

package com.fouroneone.scanner

import android.graphics.Bitmap
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Stateless scanner presentation.
 *
 * Every action leaves this component through a callback so business rules
 * remain outside the UI tree.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScannerSurface(
    quotaStatus: QuotaStatus,
    loadedBitmap: Bitmap?,
    isConverting: Boolean,
    isLoading: Boolean,
    scanError: String?,
    hasSelectedImage: Boolean,
    hasValidBase64: Boolean,
    recentScans: List<ScanHistoryItem>,
    onAuthClick: () -> Unit,
    onDocsClick: () -> Unit = {},
    onPickImage: () -> Unit,
    onRunScan: () -> Unit,
    onClearImage: () -> Unit,
    onSelectRecentScan: (String) -> Unit
) {
    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = {
                    Text(
                        text = "411 Scanner",
                        fontWeight = FontWeight.Bold
                    )
                },
                colors =
                    TopAppBarDefaults
                        .centerAlignedTopAppBarColors(
                            containerColor =
                                MaterialTheme
                                    .colorScheme
                                    .surfaceVariant
                        ),
                actions = {
                    IconButton(
                        onClick = onDocsClick
                    ) {
                        Icon(
                            imageVector = Icons.Default.Info,
                            contentDescription = "Documents and legal",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            )
        }
    ) { innerPadding ->
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .padding(horizontal = 24.dp)
                    .verticalScroll(
                        rememberScrollState()
                    ),
            horizontalAlignment =
                Alignment.CenterHorizontally,
            verticalArrangement =
                Arrangement.Top
        ) {
            /*
             * Branding and live quota status belong at the top of the
             * scanner surface, but quota authority remains outside this UI.
             */
            ScannerHeaderBranding(
                quotaStatus = quotaStatus,
                onAuthClick = onAuthClick
            )

            Spacer(
                modifier = Modifier.height(16.dp)
            )

            /*
             * Preview accepts already-processed bitmap state. Image decoding
             * and Base64 conversion remain orchestration responsibilities.
             */
            ImagePreviewFrame(
                bitmap = loadedBitmap,
                isConverting = isConverting
            )

            Spacer(
                modifier = Modifier.height(16.dp)
            )

            /*
             * The production scan ticker appears only while execution is
             * active. It carries no scan-state authority of its own.
             */
            if (isLoading) {
                CoinStarTicker(
                    modifier =
                        Modifier.fillMaxWidth()
                )

                Spacer(
                    modifier =
                        Modifier.height(16.dp)
                )
            }

            /*
             * Controls receive precomputed eligibility state and callbacks.
             * They do not decide quota, ad, or repository behavior here.
             */
            ScanControlsSection(
                hasSelectedImage =
                    hasSelectedImage,
                hasValidBase64 =
                    hasValidBase64,
                isLoading =
                    isLoading,
                isConverting =
                    isConverting,
                scanError =
                    scanError,
                onPickImage =
                    onPickImage,
                onRunScan =
                    onRunScan,
                onClearImage =
                    onClearImage
            )

            /*
             * Recent Scans represents reports delivered to this Android
             * client. It is separate from server-side Cache Bank storage.
             *
             * Hide the tray while a scan is executing so an in-flight result
             * cannot be visually competed with by an older local report.
             */
            if (
                !isLoading &&
                recentScans.isNotEmpty()
            ) {
                Spacer(
                    modifier =
                        Modifier.height(24.dp)
                )

                RecentScansTray(
                    recentScans =
                        recentScans,
                    onSelectScan = {
                        cachedJson ->
                        onSelectRecentScan(
                            cachedJson
                        )
                    }
                )
            }

            Spacer(
                modifier =
                    Modifier.height(24.dp)
            )
        }
    }
}