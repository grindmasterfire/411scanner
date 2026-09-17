/**
 * @file: ScannerLaunchTransition.kt
 * @class: Class 1 (Focused UI Component)
 * @cap: 150 Lines
 * @responsibility:
 * Own the branded launch transition between application startup and the
 * production scanner session.
 *
 * @dependencies:
 * Jetpack Compose, Android Uri, LaunchSplash, ScannerMainScreen.
 *
 * @security_gate:
 * Presentation transition only. This component does not execute scans,
 * access quota, invoke ads, call repositories, or mutate diagnostic data.
 *
 * @owner_context:
 * 411 Scanner production Android launch flow.
 *
 * @architecture_rule:
 * Startup timing remains isolated from MainActivity and scanner-session
 * orchestration. MainActivity owns Android lifecycle; ScannerMainScreen
 * owns the scanner session.
 */

package com.fouroneone.scanner

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.coroutines.delay

/**
 * Displays the branded splash before entering the scanner.
 *
 * The existing three-second launch duration is intentionally preserved.
 * This decomposition changes ownership only, not launch behavior.
 */
@Composable
fun ScannerLaunchTransition(
    incomingUri: Uri?,
    onClearUri: () -> Unit
) {
    var showSplash by remember {
        mutableStateOf(true)
    }

    /*
     * Run once for this composition. Incoming share intents may update the
     * scanner URI without restarting the branded launch delay.
     */
    LaunchedEffect(Unit) {
        delay(3000L)
        showSplash = false
    }

    if (showSplash) {
        LaunchSplash()
        return
    }

    ScannerMainScreen(
        incomingUri = incomingUri,
        onClearUri = onClearUri
    )
}