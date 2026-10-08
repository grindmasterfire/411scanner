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
    val topUpScans: Int,
    val anniversaryEpochMs: Long? = null,
    val family: FamilyInfo? = null
)

data class FamilyInfo(
    val groupId: String,
    val isOwner: Boolean,
    val seats: List<String>,
    val maxSeats: Int
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

            val familyJson = result.optJSONObject("family")
            val family = familyJson?.let {
                val seatsJson = it.optJSONArray("seats")
                val seats = mutableListOf<String>()
                if (seatsJson != null) {
                    for (i in 0 until seatsJson.length()) {
                        seats.add(seatsJson.optString(i))
                    }
                }
                FamilyInfo(
                    groupId = it.optString("groupId"),
                    isOwner = it.optBoolean("isOwner"),
                    seats = seats,
                    maxSeats = it.optInt("maxSeats", 4)
                )
            }

            ServerQuota(
                tier = result.optString("tier"),
                scansAllowed = result.optInt("scansAllowed"),
                scansUsed = result.optInt("scansUsed"),
                remaining = result.optInt("remaining"),
                topUpScans = result.optInt("topUpScans"),
                anniversaryEpochMs = result.optLong("anniversaryEpochMs").takeIf { it > 0 },
                family = family
            )
        } catch (e: Exception) {
            Log.w(TAG, "fetchServerQuota failed: ${e.message}")
            null
        }
    }

    /**
     * Invite a family member by email. Returns the email on success,
     * null on any failure (caller shows a generic error).
     */
    suspend fun inviteFamilySeat(email: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val idToken = AuthManager.currentIdToken() ?: return@withContext false

            val payload = JSONObject().apply {
                put("data", JSONObject().apply { put("email", email) })
            }
            val requestBody = payload.toString()
                .toRequestBody("application/json; charset=utf-8".toMediaType())

            val request = Request.Builder()
                .url("https://us-central1-scanner-4ea67.cloudfunctions.net/inviteFamilySeat")
                .post(requestBody)
                .header("Authorization", "Bearer $idToken")
                .build()

            val response = httpClient.newCall(request).execute()
            val ok = response.isSuccessful
            response.close()
            ok
        } catch (e: Exception) {
            Log.w(TAG, "inviteFamilySeat failed: ${e.message}")
            false
        }
    }
}
