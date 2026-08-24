package com.fouroneone.scanner

import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object ScanRepository {

    private val auth: FirebaseAuth by lazy { FirebaseAuth.getInstance() }

    private val httpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(60, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .build()
    }

    private const val FUNCTION_URL =
        "https://us-central1-scanner-4ea67.cloudfunctions.net/scan"

    suspend fun ensureAuthenticated() = withContext(Dispatchers.IO) {
        if (auth.currentUser == null) {
            auth.signInAnonymously().await()
        }
    }

    suspend fun scan(base64Image: String): String = withContext(Dispatchers.IO) {
        ensureAuthenticated()

        val idToken = auth.currentUser?.getIdToken(false)?.await()?.token

        val payload = JSONObject().apply {
            val dataObj = JSONObject().apply {
                put("image", base64Image)
                put("mimeType", "image/jpeg")
            }
            put("data", dataObj)
        }

        val requestBody = payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType())

        val requestBuilder = Request.Builder()
            .url(FUNCTION_URL)
            .post(requestBody)

        if (!idToken.isNullOrEmpty()) {
            requestBuilder.addHeader("Authorization", "Bearer $idToken")
        }

        val response = httpClient.newCall(requestBuilder.build()).execute()
        val responseBodyString = response.body?.string() ?: throw IllegalStateException("Empty response from scan engine")

        if (!response.isSuccessful) {
            throw IllegalStateException("Scan failed (${response.code}): $responseBodyString")
        }

        responseBodyString
    }
}
