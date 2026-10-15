package com.fouroneone.scanner

import android.content.Context
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
    }
}
