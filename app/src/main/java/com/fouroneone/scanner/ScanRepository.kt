/**
 * @file: ScanRepository.kt
 * @class: Class 2 (Standard UI/Data Component)
 * @cap: 250 Lines
 * @responsibility:
 * Execute production scan and Deep Dive HTTP requests, transport optional
 * on-device OCR clues, and preserve the Cache Bank identity returned by Firebase.
 *
 * @dependencies:
 * Android Log, Kotlin coroutines, OkHttp, org.json.
 *
 * @security_gate:
 * Transport-only repository. OCR text is forwarded as a non-authoritative
 * Cache Bank clue. This client does not establish solicitation identity,
 * calculate scores, alter evidence, or mutate grounded reports.
 *
 * @owner_context:
 * 411 Scanner Android transport between scanner/result screens and Firebase
 * callable HTTP endpoints.
 */

package com.fouroneone.scanner

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

object ScanRepository {

    private const val TAG = "411_ScanRepository"

    private const val FUNCTION_URL =
        "https://us-central1-scanner-4ea67.cloudfunctions.net/scan"

    private const val DEEP_DIVE_URL =
        "https://us-central1-scanner-4ea67.cloudfunctions.net/deepDive"

    private val httpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(300, TimeUnit.SECONDS)
            .readTimeout(300, TimeUnit.SECONDS)
            .writeTimeout(300, TimeUnit.SECONDS)
            .build()
    }

    /**
     * Sends the prepared JPEG plus optional OCR text to the production
     * scan endpoint, exactly once, under the caller's request ID.
     *
     * OCR may be empty. The server treats it only as a cheap candidate
     * discovery clue and safely falls back to normal grounded analysis
     * whenever the clue is absent or insufficient.
     *
     * Returns null when the outcome is unknown (the transport dropped, or
     * the infrastructure answered instead of the scan): the server may
     * still be working, so the caller follows the request ID via
     * getScanResult. Called only by ScanWorker, never resent for the same
     * request.
     */
    suspend fun submitScan(
        requestId: String,
        base64Image: String,
        ocrText: String,
        adProof: AdProof
    ): String? = withContext(Dispatchers.IO) {
        try {
            executeScanRequest(base64Image, ocrText, requestId, adProof)
        } catch (e: ScanFailureException) {
            if (!e.outcomeUnknown) throw e
            AppLog.event("transport") { "no server outcome code5=${e.code5}, following" }
            null
        } catch (e: IOException) {
            Log.w(TAG, "Scan transport failed, following result: $requestId", e)
            // The message says why (reset, timeout, network switch).
            AppLog.event("transport") {
                "failed ${e.javaClass.simpleName}: ${AppLog.scrub(e.message.orEmpty())}, following"
            }
            null
        }
    }

    /** What following a request ID found. */
    sealed class FollowStatus {
        data class Ready(val rawJson: String) : FollowStatus()

        /** The server has the request and is still working on it. */
        object Received : FollowStatus()

        /** The server never got the request: it is safe to resend. */
        object NotReceived : FollowStatus()

        /** No answer either way (offline, or a server without the flag). */
        object Unknown : FollowStatus()
    }

    /**
     * Poll getScanResult until the server finishes or [deadlineMs] passes.
     * Always checks at least once, so a scan that finished while the app
     * was dead is delivered even when its scan window has long closed.
     * Stops early with NotReceived once [resendAtMs] has passed and the
     * server says it never got the request. Throws ScanFailureException
     * when the server recorded the attempt as failed (e.g. 30101) — the
     * outcome is final, so polling stops.
     */
    suspend fun awaitScanResult(
        requestId: String,
        deadlineMs: Long,
        resendAtMs: Long = Long.MAX_VALUE,
        intervalMs: Long = 5_000
    ): FollowStatus = withContext(Dispatchers.IO) {
        var last: FollowStatus = FollowStatus.Unknown
        do {
            try {
                val idToken = AuthManager.currentIdToken()
                val payload = JSONObject().apply {
                    put("data", JSONObject().apply {
                        put("requestId", requestId)
                    })
                }
                val requestBody = payload.toString()
                    .toRequestBody("application/json; charset=utf-8".toMediaType())

                val reqBuilder = Request.Builder()
                    .url("https://us-central1-scanner-4ea67.cloudfunctions.net/getScanResult")
                    .post(requestBody)
                if (idToken != null) {
                    reqBuilder.header("Authorization", "Bearer $idToken")
                }
                val request = reqBuilder.build()

                AppLog.event("request") { "sent path=${request.url.encodedPath}" }
                val response = httpClient.newCall(request).execute()
                val body = response.body?.string()
                response.close()

                if (response.isSuccessful && !body.isNullOrEmpty()) {
                    val result = JSONObject(body).optJSONObject("result")
                    last = when {
                        result == null -> FollowStatus.Unknown
                        !result.has("received") -> FollowStatus.Unknown
                        result.optBoolean("received") -> FollowStatus.Received
                        else -> FollowStatus.NotReceived
                    }
                    AppLog.event("response") {
                        "http=${response.code} path=${request.url.encodedPath} status=${last.javaClass.simpleName}"
                    }
                    if (result != null && result.optBoolean("ready")) {
                        if (result.optBoolean("failed")) {
                            val code5 = result.optString("code5")
                                .ifBlank { ScanErrorCodes.FALLBACK_CODE }
                            val message = result.optString("message")
                                .ifBlank { ScanErrorCodes.messageFor(code5) }
                            AppLog.event("reject") { "code5=$code5 cause=recovered_failure" }
                            throw ScanFailureException(code5, message)
                        }
                        // Return the full scan result JSON for parsing
                        result.optJSONObject("result")?.let {
                            return@withContext FollowStatus.Ready(it.toString())
                        }
                    }
                } else {
                    AppLog.event("response") { "http=${response.code} path=${request.url.encodedPath}" }
                }
            } catch (e: ScanFailureException) {
                throw e
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "Poll failed, retrying: ${e.message}")
                AppLog.event("poll") { "failed ${e.javaClass.simpleName}: ${AppLog.scrub(e.message.orEmpty())}, retrying" }
            }
            if (last == FollowStatus.NotReceived && System.currentTimeMillis() >= resendAtMs) break
            if (System.currentTimeMillis() + intervalMs > deadlineMs) break
            kotlinx.coroutines.delay(intervalMs)
        } while (true)
        last
    }

    /**
     * Raw transport for one scan request. Throws ScanFailureException with
     * the user-facing 5-digit code on HTTP errors.
     */
    private suspend fun executeScanRequest(
        base64Image: String,
        ocrText: String,
        clientRequestId: String,
        adProof: AdProof
    ): String {
        val payload = JSONObject().apply {
            put("data", JSONObject().apply {
                put("imageBase64", base64Image)
                put("mimeType", "image/jpeg")

                /*
                 * Keep the raw OCR clue separate from image identity.
                 * Cache Bank exact-image keys are based only on image bytes,
                 * and the server owns all reuse/identity decisions.
                 */
                put("ocrText", ocrText)

                // Client-generated ID for resumable scans.
                put("clientRequestId", clientRequestId)

                // Weekly free scan is counted per device as well as account.
                DeviceKey.value?.let { put("deviceKey", it) }

                // Ad-gate proof; the server verifies the ticket via SSV.
                when (adProof) {
                    is AdProof.Ticket -> put("adTicket", adProof.adTicket)
                    AdProof.NoFill -> put("adNoFill", true)
                    AdProof.None -> Unit
                }
            })
        }

        val requestBody = payload.toString()
            .toRequestBody(
                "application/json; charset=utf-8".toMediaType()
            )

        // WHY: identify the caller. Guests have no token and send no header.
        val idToken = AuthManager.currentIdToken()
        val builder = Request.Builder()
            .url(FUNCTION_URL)
            .post(requestBody)
        if (idToken != null) builder.header("Authorization", "Bearer $idToken")
        val request = builder.build()

        AppLog.event("request") { "sent path=${request.url.encodedPath}" }
        val response =
            httpClient.newCall(request).execute()
        AppLog.event("response") { "http=${response.code} path=${request.url.encodedPath}" }

        val responseBodyString =
            response.body?.string()
                ?: throw ScanFailureException(
                    ScanErrorCodes.FALLBACK_CODE,
                    ScanErrorCodes.messageFor(ScanErrorCodes.FALLBACK_CODE)
                )

        if (!response.isSuccessful) {
            // Internal log keeps the raw HTTP status; the user only ever
            // sees the 5-digit code plus its plain-language sentence.
            Log.e(
                TAG,
                "Scan HTTP error (${response.code}): $responseBodyString"
            )

            val failure =
                ScanErrorCodes.fromCallableError(response.code, responseBodyString)
            AppLog.event("reject") { "code5=${failure.code5} cause=http ${response.code}" }
            throw failure
        }

        return responseBodyString
    }

    /**
     * Fetches the Deep Dive on demand and associates it with the
     * Cache Bank record belonging to the originating scan.
     *
     * Deep Dive transport remains untouched by T03 Cache Bank OCR work.
     */
    suspend fun deepDive(
        report: ScanReport
    ): String? = withContext(Dispatchers.IO) {
        try {
            if (report.cacheKey.isBlank()) {
                Log.e(
                    TAG,
                    "Deep dive rejected because scan cache identity is missing."
                )
                return@withContext null
            }

            val payload = JSONObject().apply {
                put("data", JSONObject().apply {
                    put("cacheKey", report.cacheKey)
                    put("targetName", report.consumerCard.targetName)
                    put("report", JSONObject().apply {
                        put(
                            "actionMeterScore",
                            report.consumerCard.actionMeterScore
                        )
                        put(
                            "verdictLabel",
                            report.consumerCard.verdictLabel
                        )
                        put(
                            "essential411",
                            report.consumerCard.essential411
                        )
                        put(
                            "classificationBadges",
                            report.consumerCard.classificationBadges
                                .joinToString(", ")
                        )
                        put(
                            "revenueModel",
                            report.technicalLedger
                                .monetization
                                .revenueModel
                        )
                        put(
                            "pricing",
                            report.technicalLedger
                                .monetization
                                .pricing
                        )
                        put(
                            "complaintPattern",
                            report.technicalLedger
                                .regulatoryRecord
                                .complaintPattern
                        )
                        put(
                            "reviewSpread",
                            report.technicalLedger
                                .regulatoryRecord
                                .reviewSpread
                        )
                    })
                })
            }

            val requestBody = payload.toString()
                .toRequestBody(
                    "application/json; charset=utf-8".toMediaType()
                )

            // WHY: identify the caller for entitlement check. Without auth, backend can't verify top-up credits.
            val idToken = AuthManager.currentIdToken()
            val reqBuilder = Request.Builder()
                .url(DEEP_DIVE_URL)
                .post(requestBody)
            if (idToken != null) reqBuilder.header("Authorization", "Bearer $idToken")
            val request = reqBuilder.build()

            AppLog.event("request") { "sent path=${request.url.encodedPath}" }
            val response =
                httpClient.newCall(request).execute()
            AppLog.event("response") { "http=${response.code} path=${request.url.encodedPath}" }

            val body = response.body?.string()

            if (!response.isSuccessful || body == null) {
                Log.e(
                    TAG,
                    "Deep dive HTTP error (${response.code}): $body"
                )
                // Surface the server's reason (e.g. 40201 no top-up credit)
                // instead of silently returning nothing.
                throw ScanErrorCodes.fromCallableError(response.code, body)
            }

            val json = JSONObject(body)

            AppLog.event("parse") {
                val envelope = when {
                    json.has("result") -> "result.deepDive"
                    json.has("text") -> "text"
                    else -> "raw"
                }
                "deep_dive success parser=ScanRepository.deepDive envelope=$envelope"
            }

            when {
                json.has("result") -> {
                    val resultObj = json.optJSONObject("result")
                    resultObj?.optString("deepDive", "") ?: ""
                }

                json.has("text") ->
                    json.optString("text", "")

                else ->
                    body
            }
        } catch (e: ScanFailureException) {
            throw e
        } catch (e: Exception) {
            Log.e(
                TAG,
                "Deep dive failed: ${e.message}"
            )
            AppLog.event(if (e is org.json.JSONException) "parse" else "deep_dive") {
                "deep_dive failure at=${AppLog.failingParser(e)} error=${e.javaClass.simpleName}"
            }
            null
        }
    }
}
