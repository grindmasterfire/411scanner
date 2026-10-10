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

import android.content.Context
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
     * scan endpoint.
     *
     * OCR may be empty. The server treats it only as a cheap candidate
     * discovery clue and safely falls back to normal grounded analysis
     * whenever the clue is absent or insufficient.
     */
    suspend fun scan(
        base64Image: String,
        ocrText: String = "",
        context: Context? = null
    ): String = withContext(Dispatchers.IO) {
        // Generate a client requestId for resumable scans. If the HTTP
        // request is interrupted (navigated away, connection dropped),
        // we poll getScanResult until the server finishes.
        val clientRequestId = java.util.UUID.randomUUID().toString()

        // Persist before the network call so even an immediate
        // interruption is recoverable. Cleared on delivery.
        context?.let { PendingScanManager.savePending(it, clientRequestId) }

        try {
            val result = executeScanRequest(base64Image, ocrText, clientRequestId)
            context?.let { PendingScanManager.clearPending(it) }
            result
        } catch (e: ScanFailureException) {
            throw e
        } catch (e: IOException) {
            // Transport failed — the server may still be processing.
            // Poll for the result instead of losing the scan.
            Log.w(TAG, "Scan transport failed, polling for result: $clientRequestId")
            val result = pollForScanResult(clientRequestId)
            if (result != null) {
                context?.let { PendingScanManager.clearPending(it) }
                return@withContext result
            }

            Log.e(TAG, "Scan transport failure", e)
            val code5 = ScanErrorCodes.forTransportError(e)
            throw ScanFailureException(code5, ScanErrorCodes.messageFor(code5))
        }
    }

    /**
     * Resume a scan that was interrupted by navigation away, process
     * death, or app restart. Returns the result JSON string if the
     * server finished, null if no pending scan or still processing.
     *
     * The pending ID is cleared on successful retrieval so a subsequent
     * launch does not re-poll a completed scan.
     */
    suspend fun resumePendingScan(
        context: Context,
        maxWaitMs: Long = 120_000, // 2 minutes — server already had a head start
        intervalMs: Long = 5_000
    ): String? = withContext(Dispatchers.IO) {
        val requestId = PendingScanManager.getPending(context)
            ?: return@withContext null

        Log.d(TAG, "Resuming pending scan: $requestId")
        val result = pollForScanResult(requestId, maxWaitMs, intervalMs)
        if (result != null) {
            PendingScanManager.clearPending(context)
        }
        result
    }

    /**
     * Poll getScanResult until the server finishes or timeout.
     * Returns the result JSON string, or null on timeout.
     */
    private suspend fun pollForScanResult(
        requestId: String,
        maxWaitMs: Long = 300_000, // 5 minutes
        intervalMs: Long = 5_000   // 5 seconds
    ): String? = withContext(Dispatchers.IO) {
        val start = System.currentTimeMillis()
        while (System.currentTimeMillis() - start < maxWaitMs) {
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

                val response = httpClient.newCall(request).execute()
                val body = response.body?.string()
                response.close()

                if (response.isSuccessful && !body.isNullOrEmpty()) {
                    val result = JSONObject(body).optJSONObject("result")
                    if (result != null && result.optBoolean("ready")) {
                        val scanResult = result.optJSONObject("result")
                        // Return the full scan result JSON for parsing
                        return@withContext scanResult?.toString()
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Poll failed, retrying: ${e.message}")
            }
            kotlinx.coroutines.delay(intervalMs)
        }
        null
    }

    /**
     * Raw transport for one scan request. Throws ScanFailureException with
     * the user-facing 5-digit code on HTTP errors.
     */
    private suspend fun executeScanRequest(
        base64Image: String,
        ocrText: String,
        clientRequestId: String
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

        val response =
            httpClient.newCall(request).execute()

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

            val code5 = ScanErrorCodes.forHttpStatus(response.code)
            throw ScanFailureException(code5, ScanErrorCodes.messageFor(code5))
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

            val response =
                httpClient.newCall(request).execute()

            val body = response.body?.string()

            if (!response.isSuccessful || body == null) {
                Log.e(
                    TAG,
                    "Deep dive HTTP error (${response.code}): $body"
                )
                return@withContext null
            }

            val json = JSONObject(body)

            when {
                json.has("result") ->
                    json.optString("result", "")

                json.has("text") ->
                    json.optString("text", "")

                else ->
                    body
            }
        } catch (e: Exception) {
            Log.e(
                TAG,
                "Deep dive failed: ${e.message}"
            )
            null
        }
    }
}
