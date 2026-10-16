/**
 * @file: DeepDiveNotifications.kt
 * @class: Class 1 (Focused Logic Component)
 * @cap: 100 Lines
 * @responsibility:
 * Notifications for background Deep Dives: "Deep Dive in progress…" while
 * DeepDiveWorker runs, then one "ready" or "couldn't finish" notification.
 * Tapping opens the report the Deep Dive belongs to.
 *
 * @security_gate:
 * Presentation only. Shows the target name and the 5-digit code; never
 * report content.
 *
 * @owner_context:
 * fire 2026-10-16: "User taps, goes about their day, report arrives by
 * notification. No waiting on a spinner."
 */

package com.fouroneone.scanner

import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.ForegroundInfo

object DeepDiveNotifications {
    /** Notification route for a Deep Dive: opens the report with this cache key. */
    const val OPEN_PREFIX = "dd:"

    fun routeFor(cacheKey: String) = OPEN_PREFIX + cacheKey

    fun progressForegroundInfo(context: Context, cacheKey: String, targetName: String): ForegroundInfo {
        ScanNotifications.ensureChannels(context)
        val route = routeFor(cacheKey)
        val notification = NotificationCompat.Builder(context, ScanNotifications.CHANNEL_PROGRESS)
            .setSmallIcon(R.drawable.ic_stat_scan)
            .setContentTitle(progressTitle(targetName))
            .setContentText("We'll notify you when it's ready. You can leave the app.")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setProgress(0, 0, true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(ScanNotifications.openScanner(context, route))
            .build()
        val id = ScanNotifications.notificationId(ScanNotifications.KIND_PROGRESS, route)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(id, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(id, notification)
        }
    }

    fun notifyReady(context: Context, cacheKey: String, targetName: String) {
        ScanNotifications.postResult(context, routeFor(cacheKey), readyTitle(targetName), "Tap to read it.")
    }

    fun notifyFailed(context: Context, cacheKey: String, code5: String, message: String) {
        ScanNotifications.postResult(
            context, routeFor(cacheKey), "The Deep Dive couldn't finish", "$message Reference code: $code5"
        )
    }

    fun cancelResult(context: Context, cacheKey: String) {
        NotificationManagerCompat.from(context)
            .cancel(ScanNotifications.notificationId(ScanNotifications.KIND_RESULT, routeFor(cacheKey)))
    }

    internal fun progressTitle(targetName: String) =
        if (targetName.isBlank()) "Deep Dive in progress…" else "Deep Dive on $targetName in progress…"

    internal fun readyTitle(targetName: String) =
        if (targetName.isBlank()) "Your Deep Dive is ready" else "Your Deep Dive on $targetName is ready"
}
