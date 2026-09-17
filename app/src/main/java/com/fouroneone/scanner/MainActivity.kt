/**
 * @file: MainActivity.kt
 * @class: Class 1 (Focused Android Host)
 * @cap: 150 Lines
 * @responsibility:
 * Host the 411 Scanner Android lifecycle, initialize app services, receive
 * shared-image intents, and attach the Compose application surface.
 *
 * @dependencies:
 * Android ComponentActivity/Intent/Uri, Jetpack Compose, FirebaseApp,
 * AuthManager, AdManager, BillingManager, ScannerLaunchTransition.
 *
 * @security_gate:
 * Lifecycle/bootstrap only. This activity does not execute scans, consume
 * quota, call Gemini, calculate scores, or mutate diagnostic reports.
 *
 * @owner_context:
 * 411 Scanner production Android entry point.
 *
 * @lifecycle_rule:
 * MainActivity is locked to portrait in AndroidManifest.xml. This prevents
 * accidental device rotation from recreating the Activity and destroying
 * transient scan-session state during an in-flight request.
 */

package com.fouroneone.scanner

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.google.firebase.FirebaseApp

/**
 * Thin Android host around the Compose scanner application.
 *
 * Scanner workflow belongs outside this class so Activity lifecycle concerns
 * cannot become coupled to quota, network, or report logic.
 */
class MainActivity : ComponentActivity() {

    /**
     * Current image URI received from Android's share sheet.
     *
     * Activity-level state allows onNewIntent() to update an already-running
     * scanner without rebuilding scan workflow inside the Activity.
     */
    private var incomingImageUriState by mutableStateOf<Uri?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        /*
         * ScannerApp may already have initialized Firebase. The defensive
         * call preserves the existing startup behavior without making this
         * Activity responsible for Firebase configuration.
         */
        try {
            FirebaseApp.initializeApp(applicationContext)
        } catch (e: Exception) {
        }

        enableEdgeToEdge()

        incomingImageUriState =
            IntentHandler.extractImageUri(intent)

        AuthManager.init(applicationContext)
        AdManager.initialize(applicationContext)
        BillingManager.initialize(applicationContext)

        setContent {
            MaterialTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    ScannerLaunchTransition(
                        incomingUri = incomingImageUriState,
                        onClearUri = {
                            incomingImageUriState = null
                        }
                    )
                }
            }
        }
    }

    /**
     * Accepts a new shared image while MainActivity is already running.
     */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)

        val extractedUri =
            IntentHandler.extractImageUri(intent)

        if (extractedUri != null) {
            incomingImageUriState = extractedUri
        }
    }
}