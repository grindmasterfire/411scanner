/**
 * @file: DeepDiveWorker.kt
 * @class: Class 2 (Standard UI/Data Component)
 * @cap: 200 Lines
 * @responsibility:
 * Run one Deep Dive in the background, independent of any screen: send it
 * once under its own request ID, follow that ID until the server has the
 * outcome, save the Deep Dive on the device, and notify the user.
 *
 * @dependencies:
 * WorkManager, DeepDiveStore, ScanRepository, DeepDiveNotifications,
 * AuthManager, QuotaManager.
 *
 * @security_gate:
 * Transport only. Starts after the user confirmed the 1-credit spend. The
 * server claims the request ID before it charges anything, so every repeat
 * of the same ID (a poll, a retry after process death) returns that dive's
 * outcome and never runs or charges a second dive.
 *
 * @owner_context:
 * fire 2026-10-16: "Deep Dive runs server-side and async. User taps, goes
 * about their day, report arrives by notification." Same contract as
 * background scans (ScanWorker, Story 6.9/6.10).
 *
 * The server keeps a request's outcome 24h. A dive still unresolved after
 * that ends in one shown failure (never a silent resend under a new ID).
 */

package com.fouroneone.scanner

import android.content.Context
import android.util.Log
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import kotlinx.coroutines.delay
import org.json.JSONObject
import java.util.UUID

class DeepDiveWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    private fun pending() =
        DeepDiveStore.pendingFor(applicationContext, inputData.getString(KEY_CACHE_KEY).orEmpty())

    override suspend fun getForegroundInfo(): ForegroundInfo {
        val p = pending()
        return DeepDiveNotifications.progressForegroundInfo(
            applicationContext, p?.cacheKey.orEmpty(), p?.targetName.orEmpty()
        )
    }

    override suspend fun doWork(): Result {
        val context = applicationContext
        val pending = pending() ?: return Result.success() // already resolved
        AuthManager.init(context)
        AppLog.event("deep_dive") { "worker start attempt=$runAttemptCount" }
        try {
            setForeground(getForegroundInfo())
        } catch (e: Exception) {
            // Android 12+ may refuse a foreground start from the background;
            // the dive still runs, only the progress notification is missing.
            Log.w(TAG, "Foreground refused: ${e.message}")
        }

        if (System.currentTimeMillis() - pending.startedAt > SERVER_RETENTION_MS) {
            fail(context, pending, "70101", "The Deep Dive couldn't finish.")
            return Result.success()
        }

        val runEnds = System.currentTimeMillis() + RUN_WINDOW_MS
        while (true) {
            val reply = try {
                ScanRepository.requestDeepDive(JSONObject(pending.data), pending.requestId)
            } catch (e: ScanFailureException) {
                if (e.outcomeUnknown) {
                    ScanRepository.DeepDiveReply.Unreachable(e.message.orEmpty())
                } else {
                    // The server's answer (e.g. 40201 no top-up credit): final.
                    fail(context, pending, e.code5, e.message.orEmpty())
                    return Result.success()
                }
            }
            when (reply) {
                is ScanRepository.DeepDiveReply.Ready -> {
                    DeepDiveStore.save(context, pending.cacheKey, reply.text)
                    DeepDiveStore.endPending(context, pending.cacheKey)
                    DeepDiveNotifications.notifyReady(context, pending.cacheKey, pending.targetName)
                    QuotaManager.refreshServerQuota()
                    AppLog.event("deep_dive") { "worker delivered" }
                    return Result.success()
                }
                else -> {
                    // Still running, or no answer: ask again under the same ID.
                    if (System.currentTimeMillis() > runEnds) return Result.retry()
                    delay(POLL_MS)
                }
            }
        }
    }

    private fun fail(context: Context, pending: DeepDiveStore.Pending, code5: String, message: String) {
        DeepDiveStore.endPending(context, pending.cacheKey)
        DeepDiveStore.setError(context, pending.cacheKey, "$message\nReference code: $code5")
        DeepDiveNotifications.notifyFailed(context, pending.cacheKey, code5, message)
        QuotaManager.refreshServerQuota()
        AppLog.event("deep_dive") { "worker failed code5=$code5" }
    }

    companion object {
        const val KEY_CACHE_KEY = "cache_key"
        private const val TAG = "DeepDiveWorker"
        private const val POLL_MS = 10_000L
        // WorkManager stops a run at ~10 minutes; hand over before that.
        private const val RUN_WINDOW_MS = 9 * 60 * 1000L
        private const val SERVER_RETENTION_MS = 24 * 60 * 60 * 1000L

        private fun workName(cacheKey: String) = "411_deep_dive_$cacheKey"

        /**
         * Start a Deep Dive for this report (the user already confirmed the
         * credit). One at a time per report: false if one is in flight or
         * the report has no Cache Bank identity.
         */
        fun start(context: Context, report: ScanReport): Boolean {
            val data = ScanRepository.deepDiveData(report) ?: return false
            if (DeepDiveStore.pendingFor(context, report.cacheKey) != null) return false
            DeepDiveStore.beginPending(
                context,
                DeepDiveStore.Pending(
                    cacheKey = report.cacheKey,
                    requestId = "dd_" + UUID.randomUUID().toString(),
                    data = data.toString(),
                    targetName = report.consumerCard.targetName,
                    startedAt = System.currentTimeMillis()
                )
            )
            DeepDiveNotifications.cancelResult(context, report.cacheKey)
            enqueue(context, report.cacheKey, ExistingWorkPolicy.KEEP)
            AppLog.event("deep_dive") { "queued" }
            return true
        }

        /** App open: re-attach every dive still in flight (polling is safe). */
        fun recoverOnAppOpen(context: Context) {
            DeepDiveStore.allPending(context).forEach {
                enqueue(context, it.cacheKey, ExistingWorkPolicy.KEEP)
            }
        }

        private fun enqueue(context: Context, cacheKey: String, policy: ExistingWorkPolicy) {
            val request = OneTimeWorkRequestBuilder<DeepDiveWorker>()
                .setInputData(workDataOf(KEY_CACHE_KEY to cacheKey))
                .setConstraints(Constraints(requiredNetworkType = NetworkType.CONNECTED))
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(workName(cacheKey), policy, request)
        }
    }
}
