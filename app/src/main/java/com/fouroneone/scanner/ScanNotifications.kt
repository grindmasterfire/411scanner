/**
 * @file: ScanNotifications.kt
 * @class: Class 1 (Focused Logic Component)
 * @cap: 150 Lines
 * @responsibility:
 * Build the background-scan notifications: the "Investigating…" foreground
 * notification while a run is active, the waiting notification between
 * runs (so something is always shown until the scan lands), and the one
 * completion notification — the pickup slip. One set per scan, so each of
 * Professional's parallel scans has its own. Tapping a scan's notification
 * opens that scan's report.
 *
 * @security_gate:
 * Presentation only. Shows the target name and the 5-digit code; never
 * report content, evidence, or raw HTTP statuses.
 *
 * @owner_context:
 * 411 Scanner background scans: the user can leave the app while the 411
 * is researched and is told when it lands.
 */

package com.fouroneone.scanner

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.ForegroundInfo
import kotlinx.coroutines.flow.MutableStateFlow

object ScanNotifications {

    internal const val CHANNEL_PROGRESS = "scan_progress"
    private const val CHANNEL_RESULT = "scan_result"
    internal const val KIND_PROGRESS = 1
    internal const val KIND_RESULT = 2
    private const val KIND_WAITING = 3

    const val WAITING_TEXT = "We'll notify you when your report's ready."

    /** MainActivity extra: the scan whose notification was tapped. */
    const val EXTRA_REQUEST_ID = "com.fouroneone.scanner.REQUEST_ID"

    /**
     * Report the user asked to open from a notification. MainActivity sets
     * it; the scanner screen opens that report and clears it.
     */
    val openRequests = MutableStateFlow<String?>(null)

    /* Stable per-scan notification ID; the kind keeps a scan's three apart. */
    internal fun notificationId(kind: Int, requestId: String) =
        kind * 0x100000 + (requestId.hashCode() and 0xFFFFF)

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_PROGRESS, "Scans in progress", NotificationManager.IMPORTANCE_LOW)
                .apply { description = "Shown while a scan is being researched." }
        )
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_RESULT, "Scan results", NotificationManager.IMPORTANCE_DEFAULT)
                .apply { description = "Tells you when your 411 report is ready." }
        )
    }

    /**
     * Foreground notification for ScanWorker. Ongoing: it stays until the
     * scan finishes. (Android 14+ lets users swipe away even ongoing
     * notifications; that hides it but does not stop the scan.)
     */
    fun progressForegroundInfo(context: Context, requestId: String): ForegroundInfo {
        ensureChannels(context)
        val notification = NotificationCompat.Builder(context, CHANNEL_PROGRESS)
            .setSmallIcon(R.drawable.ic_stat_scan)
            .setContentTitle("Investigating…")
            .setContentText(WAITING_TEXT)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setProgress(0, 0, true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(openScanner(context, requestId))
            .build()
        val id = notificationId(KIND_PROGRESS, requestId)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(id, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(id, notification)
        }
    }

    /**
     * Between runs (no foreground service is active), keep the scan
     * visible with a plain ongoing notification. No countdown.
     */
    fun showWaiting(context: Context, requestId: String) {
        ensureChannels(context)
        if (!canPost(context)) return
        val notification = NotificationCompat.Builder(context, CHANNEL_PROGRESS)
            .setSmallIcon(R.drawable.ic_stat_scan)
            .setContentTitle("Investigating…")
            .setContentText(WAITING_TEXT)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setProgress(0, 0, true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setContentIntent(openScanner(context, requestId))
            .build()
        try {
            NotificationManagerCompat.from(context).notify(notificationId(KIND_WAITING, requestId), notification)
        } catch (e: SecurityException) {
            AppLog.event("notify") { "waiting notification refused ${e.javaClass.simpleName}" }
        }
    }

    fun cancelWaiting(context: Context, requestId: String) {
        NotificationManagerCompat.from(context).cancel(notificationId(KIND_WAITING, requestId))
    }

    fun notifyDelivered(context: Context, requestId: String, targetName: String) {
        val title = if (targetName.isBlank()) "Your 411 is ready" else "Your 411 on $targetName is ready"
        postResult(context, requestId, title, "Tap to open the report.")
    }

    fun notifyFailed(context: Context, requestId: String, code5: String, message: String) {
        postResult(context, requestId, "The scan couldn't finish", "$message Reference code: $code5")
    }

    /** The screen showed the outcome itself; the notification is redundant. */
    fun cancelResult(context: Context, requestId: String) {
        NotificationManagerCompat.from(context).cancel(notificationId(KIND_RESULT, requestId))
    }

    /** A replaced scan leaves nothing behind. */
    fun cancelAll(context: Context, requestId: String) {
        val manager = NotificationManagerCompat.from(context)
        listOf(KIND_PROGRESS, KIND_RESULT, KIND_WAITING)
            .forEach { manager.cancel(notificationId(it, requestId)) }
    }

    internal fun postResult(context: Context, requestId: String, title: String, text: String) {
        ensureChannels(context)
        if (!canPost(context)) {
            AppLog.event("notify") { "result notification blocked (permission off)" }
            return
        }
        val notification = NotificationCompat.Builder(context, CHANNEL_RESULT)
            .setSmallIcon(R.drawable.ic_stat_scan)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setContentIntent(openScanner(context, requestId))
            .build()
        try {
            NotificationManagerCompat.from(context).notify(notificationId(KIND_RESULT, requestId), notification)
        } catch (e: SecurityException) {
            AppLog.event("notify") { "result notification refused ${e.javaClass.simpleName}" }
        }
    }

    internal fun canPost(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) return false
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    // Brings MainActivity forward carrying the scan, so the screen opens
    // that scan's report. One PendingIntent per scan (request code), or
    // every notification would share the latest scan's extra.
    internal fun openScanner(context: Context, requestId: String): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(EXTRA_REQUEST_ID, requestId)
        }
        return PendingIntent.getActivity(
            context,
            requestId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
}
