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

        val requestBody = payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType())

        val requestBuilder = Request.Builder()
            .url(FUNCTION_URL)
            .post(requestBody)

        val response = httpClient.newCall(requestBuilder.build()).execute()
        val responseBodyString = response.body?.string() ?: throw IllegalStateException("Empty response from scan engine")

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
}