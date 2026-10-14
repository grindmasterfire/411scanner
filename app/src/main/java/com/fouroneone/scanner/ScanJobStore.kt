/**
 * @file: ScanJobStore.kt
 * @class: Class 2 (Standard UI/Data Component)
 * @cap: 300 Lines
 * @responsibility:
 * Persist the background scans in flight (request ID, phase, the specimen
 * waiting to be sent) and each outcome until the scanner screen has shown
 * it, and expose them as observable state.
 *
 * @security_gate:
 * Stores opaque request UUIDs, the prepared image and OCR clue for queued
 * scans, and the ad proof the server will verify. Each image is deleted as
 * soon as its scan reaches an outcome. Never backed up
 * (backup_rules.xml / data_extraction_rules.xml).
 *
 * @owner_context:
 * 411 Scanner scan-survival principle: once the specimen is in the tray and
 * the scan button is pressed, the scan must survive the user leaving the
 * app. Replaces PendingScanManager's screen-tied recovery.
 *
 * @critical_rule:
 * Professional runs several scans at once; every other tier holds one slot,
 * and a new scan replaces the one in flight (begin(exclusive = true)).
 * markSubmitted() is committed to disk before a scan's request first goes
 * out; later runs follow it by polling. It is sent again only when the
 * server explicitly says it never received it (getScanResult
 * received:false): the server claims each request ID before charging, so
 * a resend can never run or charge twice.
 * Every write is keyed by request ID, so work for one scan can never touch
 * another. There is no give-up window: a scan stays unfinished until its
 * result lands or the server's 24h scan_results retention has passed, and
 * only then fails, out loud ([expire]).
 */

package com.fouroneone.scanner

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/** What the scanner screen sees of one background scan. */
sealed class ScanJobState {
    abstract val requestId: String

    /**
     * waiting: past the live scan window (or picked up again after the app
     * was killed); the job checks back until the result lands.
     */
    data class Running(override val requestId: String, val waiting: Boolean) : ScanJobState()

    data class Delivered(override val requestId: String, val rawJson: String) : ScanJobState()

    data class Failed(override val requestId: String, val code5: String, val message: String) : ScanJobState()
}

/** The specimen and proof a queued scan sends. */
data class ScanJobInput(val base64Image: String, val ocrText: String, val adProof: AdProof)

object ScanJobStore {

    enum class Phase { QUEUED, SUBMITTED, DELIVERED, FAILED }

    private const val PREFS = "scan_job_prefs"
    private const val JOB_PREFIX = "job."

    /** The server keeps scan_results for 24h; after that nothing is recoverable. */
    const val RESULT_RETENTION_MS = 24 * 60 * 60 * 1000L

    /** The single give-up: the full 24h passed with no result. */
    const val EXPIRED_CODE5 = "20301"
    const val EXPIRED_MESSAGE =
        "We couldn't get your report back from the scanner within 24 hours. We've logged it."

    private val _jobs = MutableStateFlow<List<ScanJobState>>(emptyList())
    private var loaded = false

    /*
     * Requests this process just queued or a worker here is running right
     * now. Owned work is live: app open leaves it alone.
     */
    val ownedRequestIds: MutableSet<String> = ConcurrentHashMap.newKeySet()

    private data class Job(
        val requestId: String,
        val phase: Phase,
        val startedAt: Long,
        val waiting: Boolean = false,
        val sentAt: Long = 0L,
        val ocrText: String = "",
        val adKind: String = "none",
        val adTicket: String? = null,
        val code5: String? = null,
        val message: String? = null
    ) {
        fun toJson(): String = JSONObject()
            .put("phase", phase.name)
            .put("startedAt", startedAt)
            .put("waiting", waiting)
            .put("sentAt", sentAt)
            .put("ocrText", ocrText)
            .put("adKind", adKind)
            .put("adTicket", adTicket ?: JSONObject.NULL)
            .put("code5", code5 ?: JSONObject.NULL)
            .put("message", message ?: JSONObject.NULL)
            .toString()

        val unfinished get() = phase == Phase.QUEUED || phase == Phase.SUBMITTED

        companion object {
            private fun JSONObject.stringOrNull(key: String): String? =
                if (isNull(key)) null else optString(key).takeIf { it.isNotBlank() }

            fun parse(requestId: String, json: String): Job? = runCatching {
                val o = JSONObject(json)
                Job(
                    requestId = requestId,
                    phase = Phase.valueOf(o.getString("phase")),
                    startedAt = o.optLong("startedAt"),
                    waiting = o.optBoolean("waiting"),
                    sentAt = o.optLong("sentAt"),
                    ocrText = o.optString("ocrText"),
                    adKind = o.optString("adKind", "none"),
                    adTicket = o.stringOrNull("adTicket"),
                    code5 = o.stringOrNull("code5"),
                    message = o.stringOrNull("message")
                )
            }.getOrNull()
        }
    }

    /** Every scan still in flight or waiting to be shown, oldest first. */
    fun observe(context: Context): StateFlow<List<ScanJobState>> {
        synchronized(this) {
            if (!loaded) publish(context)
        }
        return _jobs.asStateFlow()
    }

    /**
     * Queue a new scan. exclusive (every tier but Professional): the new
     * scan replaces all others. Returns the request IDs it replaced, whose
     * work the caller must cancel.
     */
    @Synchronized
    fun begin(
        context: Context,
        requestId: String,
        input: ScanJobInput,
        exclusive: Boolean,
        now: Long = System.currentTimeMillis()
    ): List<String> {
        val replaced = if (exclusive) jobs(context).map { it.requestId } else emptyList()
        replaced.forEach { remove(context, it) }
        val dir = jobDir(context).apply { mkdirs() }
        File(dir, imageName(requestId)).writeText(input.base64Image)
        val (kind, ticket) = when (val proof = input.adProof) {
            is AdProof.Ticket -> "ticket" to proof.adTicket
            AdProof.NoFill -> "nofill" to null
            AdProof.None -> "none" to null
        }
        write(context, Job(requestId, Phase.QUEUED, now, ocrText = input.ocrText, adKind = kind, adTicket = ticket))
        ownedRequestIds.add(requestId)
        publish(context)
        return replaced
    }

    fun requestIds(context: Context): List<String> = jobs(context).map { it.requestId }

    /** Phase of this request, or null if it is not (or no longer) tracked. */
    fun phaseFor(context: Context, requestId: String): Phase? = job(context, requestId)?.phase

    fun startedAt(context: Context, requestId: String): Long = job(context, requestId)?.startedAt ?: 0L

    fun readInput(context: Context, requestId: String): ScanJobInput? {
        val job = job(context, requestId) ?: return null
        val image = File(jobDir(context), imageName(requestId))
        if (!image.exists()) return null
        val proof = when (job.adKind) {
            "ticket" -> job.adTicket?.let { AdProof.Ticket(it) } ?: AdProof.None
            "nofill" -> AdProof.NoFill
            else -> AdProof.None
        }
        return ScanJobInput(image.readText(), job.ocrText, proof)
    }

    /**
     * QUEUED -> SUBMITTED, durably, before the request is sent. Returns
     * false if this request was already sent (or is gone): poll instead.
     */
    @Synchronized
    fun markSubmitted(context: Context, requestId: String, now: Long = System.currentTimeMillis()): Boolean {
        val job = job(context, requestId)?.takeIf { it.phase == Phase.QUEUED } ?: return false
        write(context, job.copy(phase = Phase.SUBMITTED, sentAt = now))
        return true
    }

    /** When this scan's request last went out (0 if never). */
    fun sentAt(context: Context, requestId: String): Long = job(context, requestId)?.sentAt ?: 0L

    /** A resend is going out, after the server said it never got the request. */
    @Synchronized
    fun markResent(context: Context, requestId: String, now: Long = System.currentTimeMillis()): Boolean {
        val job = job(context, requestId)?.takeIf { it.phase == Phase.SUBMITTED } ?: return false
        write(context, job.copy(sentAt = now))
        return true
    }

    @Synchronized
    fun deliver(context: Context, requestId: String, rawJson: String): Boolean {
        val job = job(context, requestId)?.takeIf { it.unfinished } ?: return false
        File(jobDir(context).apply { mkdirs() }, resultName(requestId)).writeText(rawJson)
        write(context, job.copy(phase = Phase.DELIVERED))
        File(jobDir(context), imageName(requestId)).delete()
        publish(context)
        return true
    }

    @Synchronized
    fun fail(context: Context, requestId: String, code5: String, message: String): Boolean {
        val job = job(context, requestId)?.takeIf { it.unfinished } ?: return false
        write(context, job.copy(phase = Phase.FAILED, code5 = code5, message = message))
        File(jobDir(context), imageName(requestId)).delete()
        publish(context)
        return true
    }

    /** The live window passed with no result: the job now checks back. */
    @Synchronized
    fun markWaiting(context: Context, requestId: String) {
        val job = job(context, requestId)?.takeIf { it.unfinished } ?: return
        write(context, job.copy(waiting = true))
        publish(context)
    }

    /**
     * App open: flag every unfinished scan not running in this process as
     * waiting and return their IDs so work can be re-attached. A scan past
     * the 24h retention fails out loud instead.
     */
    @Synchronized
    fun claimForRecovery(context: Context, now: Long = System.currentTimeMillis()): List<String> {
        val claimed = mutableListOf<String>()
        for (job in jobs(context).filter { it.unfinished }) {
            if (now - job.startedAt >= RESULT_RETENTION_MS) {
                expire(context, job.requestId)
                continue
            }
            if (job.requestId !in ownedRequestIds) write(context, job.copy(waiting = true))
            claimed.add(job.requestId)
        }
        publish(context)
        return claimed
    }

    fun isExpired(context: Context, requestId: String, now: Long = System.currentTimeMillis()): Boolean =
        now - startedAt(context, requestId) >= RESULT_RETENTION_MS

    /** 24h passed and the server holds no result: one honest failure. */
    fun expire(context: Context, requestId: String): Boolean =
        fail(context, requestId, EXPIRED_CODE5, EXPIRED_MESSAGE)

    /** The screen showed the outcome: it must not come back on reopen. */
    @Synchronized
    fun acknowledge(context: Context, requestId: String) {
        val phase = phaseFor(context, requestId)
        if (phase == Phase.DELIVERED || phase == Phase.FAILED) {
            remove(context, requestId)
            publish(context)
        }
    }

    @Synchronized
    fun clear(context: Context) {
        prefs(context).edit().clear().commit()
        jobDir(context).listFiles()?.forEach { it.delete() }
        ownedRequestIds.clear()
        publish(context)
    }

    private fun jobs(context: Context): List<Job> =
        prefs(context).all.mapNotNull { (key, value) ->
            if (!key.startsWith(JOB_PREFIX) || value !is String) null
            else Job.parse(key.removePrefix(JOB_PREFIX), value)
        }.sortedBy { it.startedAt }

    private fun job(context: Context, requestId: String): Job? =
        prefs(context).getString(JOB_PREFIX + requestId, null)?.let { Job.parse(requestId, it) }

    // commit(), not apply(): "sent" must be on disk before the request goes.
    private fun write(context: Context, job: Job) {
        prefs(context).edit().putString(JOB_PREFIX + job.requestId, job.toJson()).commit()
    }

    private fun remove(context: Context, requestId: String) {
        prefs(context).edit().remove(JOB_PREFIX + requestId).commit()
        File(jobDir(context), imageName(requestId)).delete()
        File(jobDir(context), resultName(requestId)).delete()
        ownedRequestIds.remove(requestId)
    }

    private fun publish(context: Context) {
        loaded = true
        _jobs.value = jobs(context).mapNotNull { job ->
            when (job.phase) {
                Phase.QUEUED, Phase.SUBMITTED -> ScanJobState.Running(job.requestId, job.waiting)
                Phase.DELIVERED ->
                    File(jobDir(context), resultName(job.requestId))
                        .takeIf { it.exists() }?.readText()
                        ?.takeIf { it.isNotBlank() }
                        ?.let { ScanJobState.Delivered(job.requestId, it) }
                Phase.FAILED -> {
                    val code5 = job.code5 ?: ScanErrorCodes.FALLBACK_CODE
                    ScanJobState.Failed(job.requestId, code5, job.message ?: ScanErrorCodes.messageFor(code5))
                }
            }
        }
    }

    private fun imageName(requestId: String) = "$requestId.b64"

    private fun resultName(requestId: String) = "$requestId.result.json"

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    // noBackupFilesDir: the specimen never leaves the device in a backup.
    private fun jobDir(context: Context) = File(context.applicationContext.noBackupFilesDir, "scan_job")
}
