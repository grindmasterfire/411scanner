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
            .connectTimeout(120, TimeUnit.SECONDS)
            .readTimeout(120, TimeUnit.SECONDS)
            .writeTimeout(120, TimeUnit.SECONDS)
            .build()
    }

    suspend fun scan(base64Image: String): String = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            put("data", JSONObject().apply {
                put("image", base64Image)
                put("mimeType", "image/jpeg")
            })
        }

        val requestBody = payload.toString()
            .toRequestBody("application/json; charset=utf-8".toMediaType())

        val request = Request.Builder()
            .url(FUNCTION_URL)
            .post(requestBody)
            .build()

        val response = httpClient.newCall(request).execute()
        val responseBodyString = response.body?.string()
            ?: throw IllegalStateException("Empty response from scan engine")

        if (!response.isSuccessful) {
            Log.e(TAG, "Scan HTTP error (${response.code}): $responseBodyString")
            throw IllegalStateException("Scan failed (${response.code}): $responseBodyString")
        }

        val json = JSONObject(responseBodyString)
        if (json.has("result")) {
            json.get("result").toString()
        } else {
            responseBodyString
        }
    }

    /**
     * Fetches the Deep Dive 411 on demand — called only when the user taps
     * "Would You Like To Know More?" Never pre-fetched. 1,000 token budget.
     */
    suspend fun deepDive(report: ScanReport): String? = withContext(Dispatchers.IO) {
        try {
            val payload = JSONObject().apply {
                put("data", JSONObject().apply {
                    put("targetName", report.consumerCard.targetName)
                    put("actionMeterScore", report.consumerCard.actionMeterScore)
                    put("verdictLabel", report.consumerCard.verdictLabel)
                    put("essential411", report.consumerCard.essential411)
                    put("classificationBadges", report.consumerCard.classificationBadges.joinToString(", "))
                    put("revenueModel", report.technicalLedger.monetization.revenueModel)
                    put("pricing", report.technicalLedger.monetization.pricing)
                    put("complaintPattern", report.technicalLedger.regulatoryRecord.complaintPattern)
                    put("reviewSpread", report.technicalLedger.regulatoryRecord.reviewSpread)
                    put("technicalFlags", report.technicalLedger.technicalFlags.joinToString(", "))
                })
            }

            val requestBody = payload.toString()
                .toRequestBody("application/json; charset=utf-8".toMediaType())

            val request = Request.Builder()
                .url(DEEP_DIVE_URL)
                .post(requestBody)
                .build()

            val response = httpClient.newCall(request).execute()
            val body = response.body?.string()

            if (!response.isSuccessful || body == null) {
                Log.e(TAG, "Deep dive HTTP error (${response.code}): $body")
                return@withContext null
            }

            val json = JSONObject(body)
            when {
                json.has("result") -> json.optString("result", null)
                json.has("text") -> json.optString("text", null)
                else -> body
            }
        } catch (e: Exception) {
            Log.e(TAG, "Deep dive failed: ${e.message}")
            null
        }
    }
}