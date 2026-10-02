/**
 * @file: ScannerMainScreen.kt
 * @class: Class 3 (Feature Orchestration Component)
 * @cap: 400 Lines
 * @responsibility: Own scanner-session state and connect image intake,
 * access authorization, scan execution, result navigation, local history,
 * and scanner presentation.
 * @dependencies: Compose, ScanInputProcessor, ScanAccessCoordinator,
 * ScanExecutionWorkflow, ScanHistoryManager, ScannerSurface, ResultScreen,
 * ScannerAccessOverlays.
 * @security_gate: Coordinates existing services but does not calculate
 * scores, establish solicitation identity, mutate evidence, write Cache
 * Bank records, or own quota rules.
 * @owner_context: 411 Scanner production Android scanner orchestration.
 *
 * @architecture_note:
 * This is intentionally a Class 3 feature orchestrator rather than a
 * collection of micro-components. Its job is to connect already-atomic
 * scanner services while keeping diagnostic, entitlement, persistence,
 * and Cache Bank authority outside the presentation layer.
 */

package com.fouroneone.scanner

import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch

/**
 * Owns transient state for one scanner session.
 * MainActivity is portrait-locked so ordinary device movement cannot
 * recreate this state during an in-flight scan.
 */
@Composable
fun ScannerMainScreen(
    incomingUri: Uri?,
    onClearUri: () -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    val quotaStatus by remember(context) {
        QuotaManager.getQuotaStatusFlow(context)
    }.collectAsStateWithLifecycle(
        initialValue = QuotaStatus(0, 3, false, 0L, 3, false)
    )

    var showPaywall by remember { mutableStateOf(false) }
    var showAuthDialog by remember { mutableStateOf(false) }
    var selectedUri by remember(incomingUri) { mutableStateOf(incomingUri) }
    var loadedBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var base64String by remember { mutableStateOf<String?>(null) }
    var ocrText by remember { mutableStateOf("") }
    var isConverting by remember { mutableStateOf(false) }
    var isLoading by remember { mutableStateOf(false) }
    var scanResult by remember { mutableStateOf<String?>(null) }
    var scanError by remember { mutableStateOf<String?>(null) }

    var recentScans by remember {
        mutableStateOf(
            ScanHistoryManager.getRecentScans(context)
        )
    }

    fun refreshRecentScans() {
        recentScans =
            ScanHistoryManager.getRecentScans(context)
    }

    /**
     * Prepares the selected image through ScanInputProcessor.
     *
     * OCR remains optional; a valid Base64 image may continue through
     * the normal scan path even when no OCR clue can be produced.
     */
    fun processImageUri(uri: Uri?) {
        selectedUri = uri
        scanResult = null
        scanError = null

        if (uri == null) {
            loadedBitmap = null
            base64String = null
            ocrText = ""
            return
        }

        isConverting = true

        coroutineScope.launch {
            try {
                val prepared =
                    ScanInputProcessor.prepare(
                        context,
                        uri
                    )

                loadedBitmap = prepared.bitmap
                base64String = prepared.base64Image
                ocrText = prepared.ocrText
            } catch (e: Exception) {
                loadedBitmap = null
                base64String = null
                ocrText = ""
                scanError =
                    e.message
                        ?: "Image could not be prepared for scanning"
            } finally {
                isConverting = false
            }
        }
    }

    /**
     * Executes only after ScanAccessCoordinator grants authorization.
     * OCR travels beside the image but does not affect entitlement rules.
     */
    fun executeAuthorizedScan(
        base64Image: String,
        currentOcrText: String
    ) {
        isLoading = true
        scanError = null

        coroutineScope.launch {
            try {
                val rawResponse =
                    ScanExecutionWorkflow.execute(
                        context = context,
                        base64Image = base64Image,
                        ocrText = currentOcrText
                    )

                refreshRecentScans()
                scanResult = rawResponse
            } catch (e: Exception) {
                scanError =
                    e.message ?: "Scan failed unexpectedly"
            } finally {
                isLoading = false
            }
        }
    }

    LaunchedEffect(incomingUri) {
        if (incomingUri != null) {
            processImageUri(incomingUri)
        }
    }

    val photoPickerLauncher =
        rememberLauncherForActivityResult(
            contract =
                ActivityResultContracts.PickVisualMedia()
        ) { uri: Uri? ->
            if (uri != null) {
                onClearUri()
                processImageUri(uri)
            }
        }

    /*
     * A valid delivered report replaces the intake surface until Back.
     */
    scanResult?.let { rawJson ->
        val parsedReport =
            remember(rawJson) {
                ScanReport.fromJson(rawJson)
            }

        if (parsedReport != null) {
            ResultScreen(
                report = parsedReport,
                onBackClick = {
                    scanResult = null
                    refreshRecentScans()
                },
                // Deep Dive removed from V1 initial scan (canon). Endpoint deleted;
                // wiring nulled so the button does not render. Code retained for post-V1 Pro.
                onRequestDeepDive = null
            )
            return
        }
    }

    ScannerSurface(
        quotaStatus = quotaStatus,
        loadedBitmap = loadedBitmap,
        isConverting = isConverting,
        isLoading = isLoading,
        scanError = scanError,
        hasSelectedImage =
            selectedUri != null,
        hasValidBase64 =
            !base64String.isNullOrEmpty(),
        recentScans = recentScans,
        onAuthClick = {
            showAuthDialog = true
        },
        onPickImage = {
            photoPickerLauncher.launch(
                PickVisualMediaRequest(
                    ActivityResultContracts
                        .PickVisualMedia
                        .ImageOnly
                )
            )
        },
        onRunScan = {
            val currentBase64 =
                base64String

            val currentOcrText =
                ocrText

            if (
                !currentBase64.isNullOrEmpty() &&
                !isLoading
            ) {
                coroutineScope.launch {
                    ScanAccessCoordinator
                        .requestAuthorization(
                            context = context,
                            quotaStatus = quotaStatus,
                            onAuthorized = {
                                executeAuthorizedScan(
                                    currentBase64,
                                    currentOcrText
                                )
                            },
                            onPaywallRequired = {
                                showPaywall = true
                            }
                        )
                }
            }
        },
        onClearImage = {
            onClearUri()
            processImageUri(null)
        },
        onSelectRecentScan = { cachedJson ->
            scanResult = cachedJson
        }
    )

    /*
     * Access overlays own their own entitlement UI/actions so this
     * screen remains focused on scanner-session orchestration.
     */
    ScannerAccessOverlays(
        showPaywall = showPaywall,
        showAuthDialog = showAuthDialog,
        onDismissPaywall = {
            showPaywall = false
        },
        onDismissAuthDialog = {
            showAuthDialog = false
        }
    )
}
