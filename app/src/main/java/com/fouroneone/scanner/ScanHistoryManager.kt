package com.fouroneone.scanner

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

data class ScanHistoryItem(
    val id: String,
    val targetName: String,
    val developerOrEntity: String,
    val score: Double,
    val badge: String,
    val timestamp: Long,
    val rawJson: String
)

object ScanHistoryManager {
    private const val PREFS_NAME = "fouroneone_scan_history"
    private const val KEY_HISTORY = "recent_scans_json"
    private const val MAX_HISTORY = 10

    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun saveScan(context: Context, rawJson: String) {
        val report = ScanReport.fromJson(rawJson) ?: return
        val currentHistory = getRecentScans(context).toMutableList()

        val newItem = ScanHistoryItem(
            id = System.currentTimeMillis().toString(),
            targetName = report.consumerCard.targetName,
            developerOrEntity = report.consumerCard.developerOrEntity,
            score = report.consumerCard.actionMeterScore,
            badge = report.consumerCard.actionVerdictBadge,
            timestamp = System.currentTimeMillis(),
            rawJson = rawJson
        )

        // Prevent duplicate immediate saves of the exact same target
        currentHistory.removeAll { it.targetName.equals(newItem.targetName, ignoreCase = true) }
        currentHistory.add(0, newItem)

        // Auto-prune to maintain maximum 10 items
        val pruned = currentHistory.take(MAX_HISTORY)

        val array = JSONArray()
        for (item in pruned) {
            val obj = JSONObject().apply {
                put("id", item.id)
                put("targetName", item.targetName)
                put("developerOrEntity", item.developerOrEntity)
                put("score", item.score)
                put("badge", item.badge)
                put("timestamp", item.timestamp)
                put("rawJson", item.rawJson)
            }
            array.put(obj)
        }

        getPrefs(context).edit().putString(KEY_HISTORY, array.toString()).apply()
    }

    fun getRecentScans(context: Context): List<ScanHistoryItem> {
        val jsonStr = getPrefs(context).getString(KEY_HISTORY, null) ?: return emptyList()
        val list = mutableListOf<ScanHistoryItem>()

        return try {
            val array = JSONArray(jsonStr)
            for (i in 0 until array.length()) {
                val obj = array.getJSONObject(i)
                list.add(
                    ScanHistoryItem(
                        id = obj.optString("id"),
                        targetName = obj.optString("targetName", "Unknown Target"),
                        developerOrEntity = obj.optString("developerOrEntity", "Not Identified"),
                        score = obj.optDouble("score", 5.0),
                        badge = obj.optString("badge", "⚪ SOLID APP"),
                        timestamp = obj.optLong("timestamp", 0L),
                        rawJson = obj.optString("rawJson", "")
                    )
                )
            }
            list
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun clearHistory(context: Context) {
        getPrefs(context).edit().remove(KEY_HISTORY).apply()
    }
}
