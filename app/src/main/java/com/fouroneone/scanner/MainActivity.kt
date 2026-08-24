package com.fouroneone.scanner

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private var incomingImageUriState by mutableStateOf<Uri?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        incomingImageUriState = IntentHandler.extractImageUri(intent)
        AuthManager.init()
        AdManager.initialize(applicationContext)
        BillingManager.initialize(applicationContext)

        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    ScannerMainScreen(
                        incomingUri = incomingImageUriState,
                        onClearUri = { incomingImageUriState = null }
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val extracted = IntentHandler.extractImageUri(intent)
        if (extracted != null) incomingImageUriState = extracted
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScannerMainScreen(incomingUri: Uri?, onClearUri: () -> Unit) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val quotaStatus by remember(context) { QuotaManager.getQuotaStatusFlow(context) }
        .collectAsStateWithLifecycle(initialValue = QuotaStatus(0, 3, false, 0L, 3, false))

    var showPaywall by remember { mutableStateOf(false) }
    var showAuthDialog by remember { mutableStateOf(false) }
    var selectedUri by remember(incomingUri) { mutableStateOf(incomingUri) }
    var loadedBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var base64String by remember { mutableStateOf<String?>(null) }
    var isConverting by remember { mutableStateOf(false) }
    var isLoading by remember { mutableStateOf(false) }
    var scanResult by remember { mutableStateOf<String?>(null) }
    var scanError by remember { mutableStateOf<String?>(null) }

    fun processImageUri(uri: Uri?) {
        selectedUri = uri
        scanResult = null
        scanError = null
        if (uri == null) {
            loadedBitmap = null
            base64String = null
            return
        }
        isConverting = true
        coroutineScope.launch {
            val (bitmap, b64) = ImageProcessor.processUriToBase64(context, uri)
            loadedBitmap = bitmap
            base64String = b64
            isConverting = false
        }
    }

    LaunchedEffect(incomingUri) {
        if (incomingUri != null) processImageUri(incomingUri)
    }

    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri: Uri? ->
        if (uri != null) {
            onClearUri()
            processImageUri(uri)
        }
    }

    if (scanResult != null) {
        ResultScreen(rawJson = scanResult!!, onDismiss = { scanResult = null })
        return
    }

    fun executeScan(b64: String) {
        isLoading = true
        scanError = null
        coroutineScope.launch {
            try {
                QuotaManager.recordScan(context)
                scanResult = ScanRepository.scan(b64)
            } catch (e: Exception) {
                scanError = e.message ?: "Scan failed unexpectedly"
            } finally {
                isLoading = false
            }
        }
    }

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text(text = "411 Scanner", fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 24.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Top
        ) {
            ScannerHeaderBranding(quotaStatus = quotaStatus, onAuthClick = { showAuthDialog = true })
            Spacer(modifier = Modifier.height(16.dp))
            ImagePreviewFrame(bitmap = loadedBitmap, isConverting = isConverting)
            Spacer(modifier = Modifier.height(16.dp))

            ScanControlsSection(
                hasSelectedImage = selectedUri != null,
                hasValidBase64 = !base64String.isNullOrEmpty(),
                isLoading = isLoading,
                isConverting = isConverting,
                scanError = scanError,
                onPickImage = { photoPickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                onRunScan = {
                    val currentB64 = base64String
                    if (!currentB64.isNullOrEmpty() && !isLoading) {
                        coroutineScope.launch {
                            val canScan = QuotaManager.canPerformScan(context)
                            if (!canScan) {
                                showPaywall = true
                                return@launch
                            }
                            val status = quotaStatus
                            val activity = context as? Activity
                            when {
                                status.isLifetimeUnlocked -> executeScan(currentB64)
                                status.isUnlimited && !status.isLifetimeUnlocked -> {
                                    val showAd = QuotaManager.shouldShowAdForRental(context)
                                    if (showAd && activity != null) {
                                        AdManager.showRewardedGate(activity = activity, onRewardEarned = { executeScan(currentB64) }, onAdUnavailable = { executeScan(currentB64) })
                                    } else {
                                        executeScan(currentB64)
                                    }
                                }
                                else -> {
                                    if (activity != null) {
                                        AdManager.showRewardedGate(activity = activity, onRewardEarned = { executeScan(currentB64) }, onAdUnavailable = { executeScan(currentB64) })
                                    } else {
                                        executeScan(currentB64)
                                    }
                                }
                            }
                        }
                    }
                },
                onClearImage = {
                    onClearUri()
                    processImageUri(null)
                }
            )
            Spacer(modifier = Modifier.height(24.dp))
        }
    }

    if (showPaywall) {
        PaywallModal(
            onDismiss = { showPaywall = false },
            onGrantWeekly = { coroutineScope.launch { QuotaManager.grantRentalPass(context, hours = 24 * 7) } },
            onGrantMonthly = { coroutineScope.launch { QuotaManager.grantRentalPass(context, hours = 24 * 30) } },
            onGrantLifetime = { coroutineScope.launch { QuotaManager.grantLifetimeAccess(context) } }
        )
    }

    if (showAuthDialog) {
        AuthDialog(onDismiss = { showAuthDialog = false })
    }
}
