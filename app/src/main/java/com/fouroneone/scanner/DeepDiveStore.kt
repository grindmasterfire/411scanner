package com.fouroneone.scanner

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONArray
import org.json.JSONObject

/**
 * Keeps each Deep Dive on the device, keyed by the report's cache key, so
 * leaving the report (or reopening it from Recent Scans) never loses a
 * Deep Dive the user already paid a top-up credit for, and never charges
 * them again to see it.
 */
object DeepDiveStore {
    private const val PREFS_NAME = "fouroneone_deep_dives"
    private const val KEY_ENTRIES = "entries_json"
    private const val KEY_PENDING = "pending_json"
    private const val KEY_ERRORS = "errors_json"

    /** Bumped on every change, so an open report re-reads its Deep Dive. */
    val changes = MutableStateFlow(0)
    // Recent Scans keeps 10 reports; keep room for their Deep Dives.
    private const val MAX_ENTRIES = 20

    private fun entries(context: Context): JSONArray {
        val raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_ENTRIES, null) ?: return JSONArray()
        return runCatching { JSONArray(raw) }.getOrDefault(JSONArray())
    }

    fun load(context: Context, cacheKey: String): String? {
        if (cacheKey.isBlank()) return null
        val all = entries(context)
        for (i in 0 until all.length()) {
            val obj = all.optJSONObject(i) ?: continue
            if (obj.optString("key") == cacheKey) {
                return obj.optString("text").takeIf { it.isNotBlank() }
            }
        }
        return null
    }

    @Synchronized
    fun save(context: Context, cacheKey: String, text: String) {
        if (cacheKey.isBlank() || text.isBlank()) return
        val old = entries(context)
        val next = JSONArray().put(
            JSONObject().put("key", cacheKey).put("text", text).put("savedAt", System.currentTimeMillis())
        )
        for (i in 0 until old.length()) {
            if (next.length() >= MAX_ENTRIES) break
            val obj = old.optJSONObject(i) ?: continue
            if (obj.optString("key") != cacheKey) next.put(obj)
        }
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_ENTRIES, next.toString()).apply()
        changes.value++
    }

    /*
     * Background Deep Dives in flight, keyed by cache key: the request ID the
     * server claimed, the request body (WorkManager input is capped at 10KB),
     * the target name for the notification, and when it started.
     */
    data class Pending(
        val cacheKey: String,
        val requestId: String,
        val data: String,
        val targetName: String,
        val startedAt: Long
    )

    private fun map(context: Context, key: String): JSONObject {
        val raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(key, null)
            ?: return JSONObject()
        return runCatching { JSONObject(raw) }.getOrDefault(JSONObject())
    }

    private fun putMap(context: Context, key: String, value: JSONObject) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit().putString(key, value.toString()).apply()
        changes.value++
    }

    @Synchronized
    fun beginPending(context: Context, pending: Pending) {
        putMap(context, KEY_PENDING, map(context, KEY_PENDING).put(
            pending.cacheKey,
            JSONObject()
                .put("requestId", pending.requestId)
                .put("data", pending.data)
                .put("targetName", pending.targetName)
                .put("startedAt", pending.startedAt)
        ))
        clearError(context, pending.cacheKey)
    }

    fun pendingFor(context: Context, cacheKey: String): Pending? {
        val obj = map(context, KEY_PENDING).optJSONObject(cacheKey) ?: return null
        return Pending(
            cacheKey = cacheKey,
            requestId = obj.optString("requestId"),
            data = obj.optString("data"),
            targetName = obj.optString("targetName"),
            startedAt = obj.optLong("startedAt")
        ).takeIf { it.requestId.isNotBlank() }
    }

    /** Every dive still in flight (re-attached when the app opens). */
    fun allPending(context: Context): List<Pending> {
        val all = map(context, KEY_PENDING)
        return all.keys().asSequence().mapNotNull { pendingFor(context, it) }.toList()
    }

    @Synchronized
    fun endPending(context: Context, cacheKey: String) {
        val all = map(context, KEY_PENDING)
        all.remove(cacheKey)
        putMap(context, KEY_PENDING, all)
    }

    /** The last background Deep Dive failure for this report, to show once. */
    @Synchronized
    fun setError(context: Context, cacheKey: String, message: String) {
        putMap(context, KEY_ERRORS, map(context, KEY_ERRORS).put(cacheKey, message))
    }

    fun errorFor(context: Context, cacheKey: String): String? =
        map(context, KEY_ERRORS).optString(cacheKey).takeIf { it.isNotBlank() }

    @Synchronized
    fun clearError(context: Context, cacheKey: String) {
        val all = map(context, KEY_ERRORS)
        if (all.has(cacheKey)) {
            all.remove(cacheKey)
            putMap(context, KEY_ERRORS, all)
        }
    }
}
