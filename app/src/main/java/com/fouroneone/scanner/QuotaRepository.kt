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

/**
 * Server quota for paid subscribers. The subscription scan bucket lives
 * in Firestore; the client fetches it for display (badge "23/30").
 * Null when the user is free tier, tester, or the fetch fails — the
 * badge falls back to its local states.
 */
data class ServerQuota(
    val tier: String,
    val scansAllowed: Int,
    val scansUsed: Int,
    val remaining: Int,
    val topUpScans: Int
)

object QuotaRepository {

    private const val TAG = "411_QuotaRepository"

    private const val QUOTA_URL =
        "https://us-central1-scanner-4ea67.cloudfunctions.net/getQuotaStatus"

    private val httpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    /**
     * Fetch the caller's subscription quota. Returns null for free tier,
     * testers, guests, or any failure — callers must fall back to local
     * quota state. Never throws.
     */
    suspend fun fetchServerQuota(): ServerQuota? = withContext(Dispatchers.IO) {
        try {
            val idToken = AuthManager.currentIdToken() ?: return@withContext null

            val payload = JSONObject().apply {
                put("data", JSONObject())
            }
            val requestBody = payload.toString()
                .toRequestBody("application/json; charset=utf-8".toMediaType())

            val request = Request.Builder()
                .url(QUOTA_URL)
                .post(requestBody)
                .header("Authorization", "Bearer $idToken")
                .build()

            val response = httpClient.newCall(request).execute()
            val body = response.body?.string()
            response.close()

            if (!response.isSuccessful || body.isNullOrEmpty()) return@withContext null

            // onCall protocol wraps the return in {"result": {...}}
            val result = JSONObject(body).optJSONObject("result") ?: return@withContext null
            if (result.optString("tier") == "free") return@withContext null

            ServerQuota(
                tier = result.optString("tier"),
                scansAllowed = result.optInt("scansAllowed"),
                scansUsed = result.optInt("scansUsed"),
                remaining = result.optInt("remaining"),
                topUpScans = result.optInt("topUpScans")
            )
        } catch (e: Exception) {
            Log.w(TAG, "fetchServerQuota failed: ${e.message}")
            null
        }
    }
}
