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
 * Server-owned quota. Paid tiers: the subscription bucket (badge "23/30").
 * Free tier (tier == "free"): the weekly free scan, counted by the server's
 * ad gate — scansAllowed/scansUsed are the free window's numbers.
 * Null when the user is the tester, signed out, or the fetch fails.
 */
data class ServerQuota(
    val tier: String,
    val scansAllowed: Int,
    val scansUsed: Int,
    val remaining: Int,
    val topUpScans: Int,
    val anniversaryEpochMs: Long? = null,
    val family: FamilyInfo? = null,
    val freeWindowResetsAtMs: Long? = null
) {
    val isFree: Boolean get() = tier == "free"
    /** Professional ("pro" in entitlementStore) is the only ad-free tier. */
    val isProfessional: Boolean get() = tier == "pro"
}

data class FamilyInfo(
    val groupId: String,
    val isOwner: Boolean,
    val seats: List<String>,
    val maxSeats: Int
)

data class FamilyMember(
    val uid: String,
    val email: String?,
    val isOwner: Boolean,
    val isRestricted: Boolean,
    val scansUsed: Int,
    val lastScanAt: Long?
)

data class FamilyDetails(
    val groupId: String,
    val isOwner: Boolean,
    val maxSeats: Int,
    val members: List<FamilyMember>,
    /** Emails invited but not yet accepted; each holds a seat. */
    val pendingInvites: List<String> = emptyList()
)

/** A Family invite waiting for this account to accept or decline. */
data class FamilyInvite(
    val inviteId: String,
    val ownerEmail: String
)

/** Outcome of a family action, with the server's message for the user. */
data class FamilyActionResult(
    val ok: Boolean,
    val message: String
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
     * Fetch the caller's server quota (subscription bucket or free weekly
     * scan). Returns null for guests without a token or on any failure —
     * callers must fall back to local quota state. Never throws.
     */
    suspend fun fetchServerQuota(): ServerQuota? = withContext(Dispatchers.IO) {
        try {
            val idToken = AuthManager.currentIdToken() ?: return@withContext null

            // The device key lets the badge show a free scan already used on
            // this phone, even after app data was cleared.
            val payload = JSONObject().apply {
                put("data", JSONObject().apply {
                    DeviceKey.value?.let { put("deviceKey", it) }
                })
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
            if (result.optString("tier") == "free") {
                val allowed = result.optInt("freeScansAllowed", 1)
                val used = result.optInt("freeScansUsed", 0)
                return@withContext ServerQuota(
                    tier = "free",
                    scansAllowed = allowed,
                    scansUsed = used,
                    remaining = (allowed - used).coerceAtLeast(0),
                    topUpScans = 0,
                    freeWindowResetsAtMs = result.optLong("freeWindowResetsAtMs")
                        .takeIf { it > 0 }
                )
            }

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
     * Call a family endpoint. Returns the callable "result" object, or the
     * server's user-facing error message on failure.
     */
    private suspend fun callFamilyEndpoint(name: String, data: JSONObject): Pair<JSONObject?, String?> {
        val idToken = AuthManager.currentIdToken()
        if (idToken == null) {
            Log.w(TAG, "$name: no ID token (not signed in?)")
            return null to "Sign in to manage your Family plan."
        }
        val requestBody = JSONObject().put("data", data).toString()
            .toRequestBody("application/json; charset=utf-8".toMediaType())
        val request = Request.Builder()
            .url("https://us-central1-scanner-4ea67.cloudfunctions.net/$name")
            .post(requestBody)
            .header("Authorization", "Bearer $idToken")
            .build()
        httpClient.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            val json = runCatching { JSONObject(body) }.getOrNull()
            if (response.isSuccessful) {
                return (json?.optJSONObject("result") ?: JSONObject()) to null
            }
            val message = json?.optJSONObject("error")?.optString("message").orEmpty()
            Log.w(TAG, "$name failed: ${response.code} $message")
            return null to message.ifBlank { "Something went wrong. Try again." }
        }
    }

    /**
     * Invite a family member by email. They don't need an account yet:
     * the invite waits until they sign in and accept it.
     */
    suspend fun inviteFamilySeat(email: String): FamilyActionResult = withContext(Dispatchers.IO) {
        try {
            val (result, error) = callFamilyEndpoint(
                "inviteFamilySeat", JSONObject().put("email", email)
            )
            if (result != null) {
                FamilyActionResult(true, "Invite sent to $email. They join when they open 411 Scanner and accept.")
            } else {
                FamilyActionResult(false, error ?: "Invite failed.")
            }
        } catch (e: Exception) {
            Log.w(TAG, "inviteFamilySeat failed: ${e.message}")
            FamilyActionResult(false, "Couldn't reach the server. Check your connection and try again.")
        }
    }

    /** Owner cancels a pending invite. */
    suspend fun cancelFamilyInvite(email: String): Boolean = withContext(Dispatchers.IO) {
        try {
            callFamilyEndpoint("cancelFamilyInvite", JSONObject().put("email", email)).first != null
        } catch (e: Exception) {
            Log.w(TAG, "cancelFamilyInvite failed: ${e.message}")
            false
        }
    }

    /** Family invites addressed to the signed-in account. Empty on failure. */
    suspend fun getFamilyInvites(): List<FamilyInvite> = withContext(Dispatchers.IO) {
        try {
            val result = callFamilyEndpoint("getFamilyInvites", JSONObject()).first
                ?: return@withContext emptyList()
            val arr = result.optJSONArray("invites") ?: return@withContext emptyList()
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                FamilyInvite(o.optString("inviteId"), o.optString("ownerEmail"))
            }.filter { it.inviteId.isNotEmpty() }
        } catch (e: Exception) {
            Log.w(TAG, "getFamilyInvites failed: ${e.message}")
            emptyList()
        }
    }

    /** Accept or decline a Family invite. */
    suspend fun respondFamilyInvite(inviteId: String, accept: Boolean): FamilyActionResult =
        withContext(Dispatchers.IO) {
            try {
                val (result, error) = callFamilyEndpoint(
                    "respondFamilyInvite",
                    JSONObject().put("inviteId", inviteId).put("accept", accept)
                )
                when {
                    result == null -> FamilyActionResult(false, error ?: "Something went wrong. Try again.")
                    accept -> FamilyActionResult(true, "You've joined the Family plan.")
                    else -> FamilyActionResult(true, "Invite declined.")
                }
            } catch (e: Exception) {
                Log.w(TAG, "respondFamilyInvite failed: ${e.message}")
                FamilyActionResult(false, "Couldn't reach the server. Check your connection and try again.")
            }
        }

    /**
     * Get detailed family group info for the admin board.
     * Returns null on any failure.
     */
    suspend fun getFamilyDetails(): FamilyDetails? = withContext(Dispatchers.IO) {
        try {
            val idToken = AuthManager.currentIdToken() ?: return@withContext null

            val payload = JSONObject().apply {
                put("data", JSONObject())
            }
            val requestBody = payload.toString()
                .toRequestBody("application/json; charset=utf-8".toMediaType())

            val request = Request.Builder()
                .url("https://us-central1-scanner-4ea67.cloudfunctions.net/getFamilyDetails")
                .post(requestBody)
                .header("Authorization", "Bearer $idToken")
                .build()

            val response = httpClient.newCall(request).execute()
            val body = response.body?.string()
            response.close()

            if (!response.isSuccessful || body.isNullOrEmpty()) return@withContext null

            val result = JSONObject(body).optJSONObject("result") ?: return@withContext null
            val membersJson = result.optJSONArray("members")
            val members = mutableListOf<FamilyMember>()
            if (membersJson != null) {
                for (i in 0 until membersJson.length()) {
                    val m = membersJson.getJSONObject(i)
                    members.add(
                        FamilyMember(
                            uid = m.optString("uid"),
                            email = m.optString("email").takeIf { it.isNotEmpty() },
                            isOwner = m.optBoolean("isOwner"),
                            isRestricted = m.optBoolean("isRestricted"),
                            scansUsed = m.optInt("scansUsed"),
                            lastScanAt = m.optLong("lastScanAt").takeIf { it > 0 }
                        )
                    )
                }
            }

            val pendingJson = result.optJSONArray("pendingInvites")
            val pending = (0 until (pendingJson?.length() ?: 0))
                .map { pendingJson!!.getJSONObject(it).optString("email") }
                .filter { it.isNotEmpty() }

            FamilyDetails(
                groupId = result.optString("groupId"),
                isOwner = result.optBoolean("isOwner"),
                maxSeats = result.optInt("maxSeats", 4),
                members = members,
                pendingInvites = pending
            )
        } catch (e: Exception) {
            Log.w(TAG, "getFamilyDetails failed: ${e.message}")
            null
        }
    }

    /**
     * Restrict or unrestrict a family member. Returns true on success.
     */
    suspend fun restrictFamilySeat(seatUid: String, restricted: Boolean): Boolean =
        withContext(Dispatchers.IO) {
            try {
                val idToken = AuthManager.currentIdToken() ?: return@withContext false

                val payload = JSONObject().apply {
                    put("data", JSONObject().apply {
                        put("seatUid", seatUid)
                        put("restricted", restricted)
                    })
                }
                val requestBody = payload.toString()
                    .toRequestBody("application/json; charset=utf-8".toMediaType())

                val request = Request.Builder()
                    .url("https://us-central1-scanner-4ea67.cloudfunctions.net/restrictFamilySeat")
                    .post(requestBody)
                    .header("Authorization", "Bearer $idToken")
                    .build()

                val response = httpClient.newCall(request).execute()
                val ok = response.isSuccessful
                response.close()
                ok
            } catch (e: Exception) {
                Log.w(TAG, "restrictFamilySeat failed: ${e.message}")
                false
            }
        }

    /**
     * Remove (kick) a family member. Returns true on success.
     */
    suspend fun removeFamilySeat(seatUid: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val idToken = AuthManager.currentIdToken() ?: return@withContext false

            val payload = JSONObject().apply {
                put("data", JSONObject().apply { put("seatUid", seatUid) })
            }
            val requestBody = payload.toString()
                .toRequestBody("application/json; charset=utf-8".toMediaType())

            val request = Request.Builder()
                .url("https://us-central1-scanner-4ea67.cloudfunctions.net/removeFamilySeat")
                .post(requestBody)
                .header("Authorization", "Bearer $idToken")
                .build()

            val response = httpClient.newCall(request).execute()
            val ok = response.isSuccessful
            response.close()
            ok
        } catch (e: Exception) {
            Log.w(TAG, "removeFamilySeat failed: ${e.message}")
            false
        }
    }
}
