/**
 * @file: ScannerMainScreen.kt
 * @class: Class 3 (Feature Orchestration Component)
 * @cap: 400 Lines
 * @responsibility: Own scanner-session state and connect image intake,
 * access authorization, scan execution, result navigation, local history,
 * and scanner presentation.
 * @dependencies: Compose, ScanInputProcessor, ScanAccessCoordinator,
 * ScanJobScheduler, ScanJobStore, ScanHistoryManager, ScannerSurface,
 * ResultScreen, ScannerAccessOverlays.
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
 *
 * Scans run in ScanWorker, not here: this screen hands an authorized scan
 * to the background and renders ScanJobStore's state. Leaving the screen
 * or the app never interrupts a scan.
 */

package com.fouroneone.scanner

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
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
import androidx.core.content.ContextCompat
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
    var showDocsSheet by remember { mutableStateOf(false) }
    var showPlansScreen by remember { mutableStateOf(false) }
    var selectedUri by remember(incomingUri) { mutableStateOf(incomingUri) }
    var loadedBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var base64String by remember { mutableStateOf<String?>(null) }
    var ocrText by remember { mutableStateOf("") }
    var isConverting by remember { mutableStateOf(false) }
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

    /*
     * Background scans in flight or waiting to be shown. Collected only
     * while the screen is started, so an outcome that lands while the user
     * is away waits for them.
     */
    val jobs by remember(context) {
        ScanJobStore.observe(context)
    }.collectAsStateWithLifecycle()

    // Professional (server tier "pro") runs several scans at once; every
    // other tier, tester included, holds one slot.
    val isProfessional =
        quotaStatus.serverQuota?.isProfessional == true
    val running =
        jobs.filterIsInstance<ScanJobState.Running>()

    // One-slot tiers: a live scan locks the controls; one waiting on a slow
    // result never does, and a new scan replaces it. Professional is never
    // locked: each new scan runs beside the others.
    val isLoading =
        !isProfessional && running.any { !it.waiting }
    val backgroundNote = when {
        isProfessional && running.isNotEmpty() ->
            "${running.size} scan${if (running.size == 1) "" else "s"} in progress. " +
                "We'll notify you when each report's ready."
        !isLoading && running.isNotEmpty() ->
            "Still working on your last scan. ${ScanNotifications.WAITING_TEXT} " +
                "Starting a new scan cancels it."
        else -> null
    }

    /*
     * Show each outcome exactly once, then acknowledge it so reopening
     * the screen or the app never brings it back. A report that lands
     * while another is open does not take over the screen: it is in the
     * tray, and its notification stays up as the pickup slip.
     */
    LaunchedEffect(jobs) {
        for (state in jobs) {
            when (state) {
                is ScanJobState.Delivered -> {
                    refreshRecentScans()
                    if (scanResult == null) {
                        scanResult = state.rawJson
                        ScanNotifications.cancelResult(context, state.requestId)
                    }
                    ScanJobStore.acknowledge(context, state.requestId)
                }
                is ScanJobState.Failed -> {
                    AppLog.event("scan") { "shown failure code5=${state.code5}" }
                    // User-facing failure: plain-language sentence plus the
                    // 5-digit reference code. Raw HTTP statuses never reach users.
                    val line = "${state.message}\nReference code: ${state.code5}"
                    scanError = scanError?.let { "$it\n\n$line" } ?: line
                    ScanJobStore.acknowledge(context, state.requestId)
                    ScanNotifications.cancelResult(context, state.requestId)
                }
                is ScanJobState.Running -> Unit
            }
        }
    }

    /*
     * A completion notification was tapped: open that scan's report, from
     * the store if not yet shown, otherwise from Recent Scans.
     */
    val openRequest by ScanNotifications.openRequests.collectAsStateWithLifecycle()
    LaunchedEffect(openRequest) {
        val requestId = openRequest ?: return@LaunchedEffect
        ScanNotifications.openRequests.value = null
        val pending = jobs
            .filterIsInstance<ScanJobState.Delivered>()
            .firstOrNull { it.requestId == requestId }
        val raw = pending?.rawJson
            ?: ScanHistoryManager.getRecentScans(context)
                .firstOrNull { it.id == requestId }?.rawJson
        if (raw != null) {
            refreshRecentScans()
            scanResult = raw
            pending?.let { ScanJobStore.acknowledge(context, it.requestId) }
        }
        ScanNotifications.cancelResult(context, requestId)
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
     * The scan itself runs in ScanWorker; its outcome arrives via jobState.
     */
    fun executeAuthorizedScan(
        base64Image: String,
        currentOcrText: String,
        adProof: AdProof
    ) {
        scanError = null
        ScanJobScheduler.start(
            context,
            ScanJobInput(base64Image, currentOcrText, adProof),
            multiScan = isProfessional
        )
    }

    LaunchedEffect(incomingUri) {
        if (incomingUri != null) {
            processImageUri(incomingUri)
        }
    }

    /**
     * Ad gate, then the background scan. Kept as one function so the
     * notification-permission prompt can run first and then continue.
     */
    fun authorizeAndScan(base64Image: String, currentOcrText: String) {
        coroutineScope.launch {
            ScanAccessCoordinator
                .requestAuthorization(
                    context = context,
                    quotaStatus = quotaStatus,
                    onAuthorized = { adProof ->
                        AppLog.event("gate") { "authorized proof=${adProof.javaClass.simpleName}" }
                        executeAuthorizedScan(
                            base64Image,
                            currentOcrText,
                            adProof
                        )
                    },
                    onPaywallRequired = {
                        AppLog.event("gate") { "paywall_required" }
                        showPaywall = true
                    },
                    onGateFailed = { code5 ->
                        AppLog.event("reject") { "code5=$code5 cause=gate" }
                        scanError =
                            "${ScanErrorCodes.messageFor(code5)}\nReference code: $code5"
                    }
                )
        }
    }

    /*
     * Android 13+: the "Investigating…" and "ready" notifications need
     * permission. Asked on the scan tap, before the ad; the scan goes
     * ahead whatever the answer (the report still shows on reopen).
     */
    var pendingScanInput by remember { mutableStateOf<Pair<String, String>?>(null) }
    val notificationPermissionLauncher =
        rememberLauncherForActivityResult(
            contract = ActivityResultContracts.RequestPermission()
        ) { granted ->
            AppLog.event("notify") { "permission granted=$granted" }
            pendingScanInput?.let { (image, ocr) -> authorizeAndScan(image, ocr) }
            pendingScanInput = null
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
                onRequestDeepDive = {
                    try {
                        ScanRepository.deepDive(parsedReport)
                    } finally {
                        // A Deep Dive spends a top-up credit: re-read the bank.
                        QuotaManager.refreshServerQuota()
                    }
                }
            )
            return
        }
    }

    ScannerSurface(
        quotaStatus = quotaStatus,
        loadedBitmap = loadedBitmap,
        isConverting = isConverting,
        isLoading = isLoading,
        backgroundNote = backgroundNote,
        scanError = scanError,
        hasSelectedImage =
            selectedUri != null,
        hasValidBase64 =
            !base64String.isNullOrEmpty(),
        recentScans = recentScans,
        onAuthClick = {
            showAuthDialog = true
        },
        onDocsClick = {
            showDocsSheet = true
        },
        onPlansClick = {
            showPlansScreen = true
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
            AppLog.event("tap") {
                "scan_button hasImage=${!base64String.isNullOrEmpty()} isLoading=$isLoading"
            }

            val currentBase64 =
                base64String

            val currentOcrText =
                ocrText

            if (
                !currentBase64.isNullOrEmpty() &&
                !isLoading
            ) {
                val needsPermission =
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                        ContextCompat.checkSelfPermission(
                            context,
                            Manifest.permission.POST_NOTIFICATIONS
                        ) != PackageManager.PERMISSION_GRANTED
                if (needsPermission) {
                    pendingScanInput = currentBase64 to currentOcrText
                    notificationPermissionLauncher.launch(
                        Manifest.permission.POST_NOTIFICATIONS
                    )
                } else {
                    authorizeAndScan(currentBase64, currentOcrText)
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
        },
        onPlansClick = {
            showPlansScreen = true
        }
    )

    if (showDocsSheet) {
        LegalDocumentsSheet(
            onDismiss = {
                showDocsSheet = false
            }
        )
    }

    if (showPlansScreen) {
        PlansScreen(
            quotaStatus = quotaStatus,
            onDismiss = {
                showPlansScreen = false
            }
        )
    }
}
