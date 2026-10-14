/**
 * @file: ScanWorker.kt
 * @class: Class 2 (Standard UI/Data Component)
 * @cap: 250 Lines
 * @responsibility:
 * Run one scan in the background, independent of any screen: send it once,
 * follow it to an outcome via getScanResult, complete delivery, record the
 * outcome in ScanJobStore, and notify the user. ScanJobScheduler starts new
 * scans (several at once for Professional) and re-attaches unfinished ones
 * when the app opens.
 *
 * @dependencies:
 * WorkManager, ScanJobStore, ScanRepository, ScanExecutionWorkflow,
 * ScanNotifications, AuthManager.
 *
 * @security_gate:
 * Transport and delivery only. Starts after the ad gate has authorized the
 * scan; never decides entitlement, never resends a scan.
 *
 * @owner_context:
 * 411 Scanner background scans: a specimen and a coin in, the 411 out
 * whenever it is ready. Scans take up to 5 minutes; the user must be free
 * to leave the app, take a call, or lock the phone meanwhile.
 *
 * @critical_rule:
 * A request is sent once (ScanJobStore.markSubmitted is committed first);
 * a rerun after process death only polls. It is resent only when the
 * server explicitly says it never received it: the server claims each
 * request ID before its gate charges anything, so a resend can never run
 * or charge twice. Against a server without that claim, getScanResult
 * never says "not received", so the app never resends.
 *
 * No give-up window. One run lasts at most ~10 minutes (WorkManager's
 * cap), so the job checks back on its own schedule until the result lands
 * in scan_results. The only bound is the server's 24h retention, and that
 * ends in one shown failure, never a silent clear.
 *
 * Known limits (accepted 2026-10-14):
 * - Android 14+ lets users swipe away even an ongoing notification. That
 *   hides it; the scan keeps running.
 * - Android 12+ may refuse a foreground start for a run that begins while
 *   the app is in the background. The run continues without the
 *   "Investigating…" notification; the waiting notification stays.
 * - A force-stop cancels the app's work until the next app open, which
 *   re-attaches it (ScanJobScheduler.recoverOnAppOpen).
 * - Work waits for a network connection. If the specimen sits queued (or is
 *   resent) past the ad ticket's 15-minute life, the server refuses it
 *   with 60102.
 * - If the process dies between completeDelivery and ScanJobStore.deliver,
 *   the rerun delivers again: the tray dedups by target, but the local
 *   offline quota counter may count twice. The server's count is unaffected.
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
import kotlinx.coroutines.CancellationException
import java.util.UUID
import java.util.concurrent.TimeUnit

class ScanWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun getForegroundInfo(): ForegroundInfo =
        ScanNotifications.progressForegroundInfo(
            applicationContext,
            inputData.getString(KEY_REQUEST_ID).orEmpty()
        )

    override suspend fun doWork(): Result {
        val context = applicationContext
        val requestId = inputData.getString(KEY_REQUEST_ID) ?: return Result.success()

        // Superseded by a newer scan, or already delivered: nothing to do.
        val phase = ScanJobStore.phaseFor(context, requestId)
        if (phase != ScanJobStore.Phase.QUEUED && phase != ScanJobStore.Phase.SUBMITTED) {
            return Result.success()
        }

        // After process death MainActivity never ran: auth must be ready
        // here or the request carries no ID token.
        AuthManager.init(context)
        ScanJobStore.ownedRequestIds.add(requestId)
        AppLog.beginScan(requestId)
        AppLog.event("worker") { "start phase=$phase attempt=$runAttemptCount" }

        try {
            setForeground(getForegroundInfo())
            // The foreground notification covers this run.
            ScanNotifications.cancelWaiting(context, requestId)
        } catch (e: Exception) {
            // Android 12+ refuses a foreground start from the background
            // (e.g. a rerun after process death). The scan still runs as
            // ordinary background work; only the notification is missing.
            Log.w(TAG, "Foreground refused, continuing in background: ${e.message}")
            AppLog.event("worker") { "foreground refused ${e.javaClass.simpleName}" }
        }

        val startedAt = ScanJobStore.startedAt(context, requestId)
        try {
            var raw: String? = null
            if (ScanJobStore.markSubmitted(context, requestId)) {
                raw = send(context, requestId)
            }
            if (raw == null) {
                // Follow the request ID. Inside the live window this polls
                // every 5s; after it, a run is a single check.
                val status = ScanRepository.awaitScanResult(
                    requestId,
                    deadlineMs = maxOf(liveWindowEnd(startedAt), System.currentTimeMillis()),
                    resendAtMs = ScanJobStore.sentAt(context, requestId) + RESEND_AFTER_MS
                )
                raw = (status as? ScanRepository.FollowStatus.Ready)?.rawJson
                if (status == ScanRepository.FollowStatus.NotReceived &&
                    System.currentTimeMillis() >= ScanJobStore.sentAt(context, requestId) + RESEND_AFTER_MS &&
                    ScanJobStore.markResent(context, requestId)
                ) {
                    // The upload never reached the server (e.g. the
                    // connection died mid-send). The server dedups by
                    // request ID, so resending cannot run or charge twice.
                    AppLog.event("worker") { "server never received the scan, resending" }
                    raw = send(context, requestId)
                }
            }

            if (raw == null) {
                if (ScanJobStore.isExpired(context, requestId)) {
                    AppLog.event("worker") { "expired: no result in 24h" }
                    if (ScanJobStore.expire(context, requestId)) {
                        ScanNotifications.cancelWaiting(context, requestId)
                        ScanNotifications.notifyFailed(
                            context,
                            requestId,
                            ScanJobStore.EXPIRED_CODE5,
                            ScanJobStore.EXPIRED_MESSAGE
                        )
                    }
                    return Result.success()
                }
                val delay = followUpDelayMs(System.currentTimeMillis() - startedAt)
                AppLog.event("worker") { "no result yet, checking back in ${delay / 1000}s" }
                ScanJobStore.markWaiting(context, requestId)
                ScanNotifications.showWaiting(context, requestId)
                ScanJobScheduler.followUp(context, requestId, delay)
                return Result.success()
            }

            val delivered = ScanExecutionWorkflow.completeDelivery(context, raw, requestId)
            if (ScanJobStore.deliver(context, requestId, delivered)) {
                val target = ScanReport.fromJson(delivered)?.consumerCard?.targetName.orEmpty()
                ScanNotifications.cancelWaiting(context, requestId)
                ScanNotifications.notifyDelivered(context, requestId, target)
                AppLog.event("scan") { "delivered" }
            }
        } catch (e: CancellationException) {
            // Replaced by a new scan or an app-open check, or stopped by the
            // system. A system stop is rescheduled and resumes by polling.
            throw e
        } catch (e: ScanFailureException) {
            AppLog.event("scan") { "rejected code5=${e.code5}" }
            recordFailure(context, requestId, e.code5, e.message ?: ScanErrorCodes.messageFor(e.code5))
        } catch (e: Exception) {
            AppLog.event("scan") { "failed ${e.javaClass.simpleName}" }
            val code5 = ScanErrorCodes.FALLBACK_CODE
            recordFailure(context, requestId, code5, ScanErrorCodes.messageFor(code5))
        } finally {
            ScanJobStore.ownedRequestIds.remove(requestId)
            // The server counts every attempt, delivered or not.
            QuotaManager.refreshServerQuota()
            DiagnosticsUploader.uploadAfterScan()
        }
        return Result.success()
    }

    /** Send this scan's request. Null: the outcome is unknown, follow it. */
    private suspend fun send(context: Context, requestId: String): String? {
        val input = ScanJobStore.readInput(context, requestId)
            ?: throw ScanFailureException(
                ScanErrorCodes.FALLBACK_CODE,
                ScanErrorCodes.messageFor(ScanErrorCodes.FALLBACK_CODE)
            )
        return ScanRepository.submitScan(
            requestId = requestId,
            base64Image = input.base64Image,
            ocrText = input.ocrText,
            adProof = input.adProof
        )
    }

    private fun recordFailure(context: Context, requestId: String, code5: String, message: String) {
        if (ScanJobStore.fail(context, requestId, code5, message)) {
            ScanNotifications.cancelWaiting(context, requestId)
            ScanNotifications.notifyFailed(context, requestId, code5, message)
        }
    }

    companion object {
        private const val TAG = "411_ScanWorker"
        const val KEY_REQUEST_ID = "request_id"

        /*
         * The scan function times out at 300s; allow a minute more for
         * the result write. Inside this window the job polls every 5s.
         */
        const val LIVE_WINDOW_MS = 6 * 60 * 1000L

        fun liveWindowEnd(startedAt: Long): Long = startedAt + LIVE_WINDOW_MS

        /*
         * The server claims a request the moment it arrives, so "never
         * received" this long after a send means the upload was lost.
         */
        const val RESEND_AFTER_MS = 30 * 1000L

        /*
         * After the live window, check back: often at first (a slow scan or
         * a dropped connection), then less often, until the 24h retention.
         */
        fun followUpDelayMs(sinceStartMs: Long): Long = when {
            sinceStartMs < 30 * 60 * 1000L -> 60 * 1000L
            sinceStartMs < 3 * 60 * 60 * 1000L -> 5 * 60 * 1000L
            else -> 15 * 60 * 1000L
        }
    }
}

/**
 * Starts background scans and re-attaches unfinished ones. Each scan has
 * its own unique work, so Professional's parallel scans never share a
 * chain; a one-slot tier's new scan cancels the work it replaces.
 */
object ScanJobScheduler {

    private fun workName(requestId: String) = "411_scan_$requestId"

    /**
     * Hand an authorized scan to the background. Call only after the ad
     * gate has passed (or was skipped for Professional / tester).
     * multiScan (Professional only): runs beside any scans in flight.
     * Otherwise it replaces them, as the in-app warning says.
     */
    fun start(context: Context, input: ScanJobInput, multiScan: Boolean): String {
        val requestId = UUID.randomUUID().toString()
        val replaced = ScanJobStore.begin(context, requestId, input, exclusive = !multiScan)
        val workManager = WorkManager.getInstance(context)
        replaced.forEach {
            workManager.cancelUniqueWork(workName(it))
            ScanNotifications.cancelAll(context, it)
        }
        enqueue(context, requestId, ExistingWorkPolicy.REPLACE)
        AppLog.event("worker") { "queued multiScan=$multiScan replaced=${replaced.size}" }
        return requestId
    }

    /**
     * App open: re-attach work for every scan that has not reached an
     * outcome. A scan already sent and not running in this process is
     * checked right away (REPLACE skips a pending follow-up delay; polling
     * is safe to restart). A queued scan, or one a worker here is running,
     * is left to its existing work (KEEP), so nothing is ever sent twice.
     */
    fun recoverOnAppOpen(context: Context) {
        // Pre-WorkManager pending entry: its scan cannot be followed any more.
        context.deleteSharedPreferences("pending_scan_prefs")
        for (requestId in ScanJobStore.claimForRecovery(context)) {
            val checkNow =
                requestId !in ScanJobStore.ownedRequestIds &&
                    ScanJobStore.phaseFor(context, requestId) == ScanJobStore.Phase.SUBMITTED
            AppLog.event("worker") { "recovering unfinished scan checkNow=$checkNow" }
            enqueue(context, requestId, if (checkNow) ExistingWorkPolicy.REPLACE else ExistingWorkPolicy.KEEP)
        }
    }

    /** Next check for a scan still in flight. Runs after the current run ends. */
    fun followUp(context: Context, requestId: String, delayMs: Long) {
        // Delayed work cannot be expedited.
        val request = OneTimeWorkRequestBuilder<ScanWorker>()
            .setInputData(workDataOf(ScanWorker.KEY_REQUEST_ID to requestId))
            .setConstraints(Constraints(requiredNetworkType = NetworkType.CONNECTED))
            .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork(workName(requestId), ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }

    private fun enqueue(context: Context, requestId: String, policy: ExistingWorkPolicy) {
        val request = OneTimeWorkRequestBuilder<ScanWorker>()
            .setInputData(workDataOf(ScanWorker.KEY_REQUEST_ID to requestId))
            .setConstraints(Constraints(requiredNetworkType = NetworkType.CONNECTED))
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(workName(requestId), policy, request)
    }
}
