/**
 * @file: DiagnosticsUploader.kt
 * @class: Class 1 (Focused Logic Component)
 * @cap: 150 Lines
 * @responsibility: Upload the AppLog buffer to Firestore client_diagnostics/{requestId} when a scan finishes.
 * @dependencies: AppLog, AuthManager, OkHttp, org.json.
 * @security_gate:
 * DEBUG builds only. Uploads automatically after each scan finishes, with
 * no UI. Sends already-scrubbed AppLog lines plus scan identity; no
 * request/response bodies, images, or tokens in the payload.
 * @owner_context: 411 Scanner debug diagnostics read by functions/scripts/ask-gemini.js.
 */

package com.fouroneone.scanner

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit

/**
 * Writes through the Firestore REST API with the user's Firebase ID token,
 * so security rules apply exactly as they would for the Firestore SDK
 * (which this app does not otherwise depend on).
 */
object DiagnosticsUploader {

    private const val TAG = "411_Diagnostics"
    const val COLLECTION = "client_diagnostics"

    private const val DOCUMENTS_URL =
        "https://firestore.googleapis.com/v1/projects/scanner-4ea67/databases/(default)/documents"

    private val httpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    // Outlives the scanner screen so leaving it doesn't cancel an upload.
    private val uploadScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /**
     * Fire-and-forget upload once a scan finishes, success or failure.
     * No-op in release builds. Failures go to logcat only.
     */
    fun uploadAfterScan() {
        if (!BuildConfig.DEBUG) return
        uploadScope.launch {
            upload().onSuccess { path -> Log.d(TAG, "Diagnostics uploaded: $path") }
        }
    }

    /** Returns the Firestore document path on success. */
    suspend fun upload(): Result<String> = withContext(Dispatchers.IO) {
        if (!BuildConfig.DEBUG) {
            return@withContext Result.failure(IllegalStateException("Diagnostics are debug-only"))
        }

        val requestId = AppLog.lastRequestId
            ?: return@withContext Result.failure(IllegalStateException("Run a scan first"))

        val user = AuthManager.userState.value
        val idToken = AuthManager.currentIdToken()
        if (!user.isAuthenticated || idToken == null) {
            return@withContext Result.failure(IllegalStateException("No Firebase session"))
        }

        val lines = AppLog.snapshot()
        val fields = JSONObject().apply {
            put("requestId", stringValue(requestId))
            put("uid", stringValue(user.uid))
            put("createdAt", JSONObject().put("timestampValue", utcNow()))
            put("appVersion", stringValue(BuildConfig.VERSION_NAME))
            put("buildType", stringValue(BuildConfig.BUILD_TYPE))
            put("lineCount", JSONObject().put("integerValue", lines.size.toString()))
            put("lines", JSONObject().put("arrayValue", JSONObject().put(
                "values", JSONArray().apply { lines.forEach { put(stringValue(it)) } }
            )))
        }

        // PATCH upserts: re-uploading the same scan replaces its earlier snapshot.
        val request = Request.Builder()
            .url("$DOCUMENTS_URL/$COLLECTION/$requestId")
            .patch(
                JSONObject().put("fields", fields).toString()
                    .toRequestBody("application/json; charset=utf-8".toMediaType())
            )
            .header("Authorization", "Bearer $idToken")
            .build()

        try {
            httpClient.newCall(request).execute().use { response ->
                AppLog.event("diagnostics") { "upload http=${response.code}" }
                if (response.isSuccessful) {
                    Result.success("$COLLECTION/$requestId")
                } else {
                    Log.w(TAG, "Diagnostics upload HTTP ${response.code}")
                    Result.failure(IllegalStateException("Upload failed (HTTP ${response.code})"))
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Diagnostics upload failed: ${e.javaClass.simpleName}")
            Result.failure(e)
        }
    }

    private fun stringValue(value: String) = JSONObject().put("stringValue", value)

    private fun utcNow(): String =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC") }
            .format(Date())
}
