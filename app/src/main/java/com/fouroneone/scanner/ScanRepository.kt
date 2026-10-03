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
        ocrText: String = ""
    ): String = withContext(Dispatchers.IO) {
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
                ?: throw IllegalStateException(
                    "Empty response from scan engine"
                )

        if (!response.isSuccessful) {
            Log.e(
                TAG,
                "Scan HTTP error (${response.code}): $responseBodyString"
            )

            throw IllegalStateException(
                "Scan failed (${response.code}): $responseBodyString"
            )
        }

        responseBodyString
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

            val request = Request.Builder()
                .url(DEEP_DIVE_URL)
                .post(requestBody)
                .build()

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
