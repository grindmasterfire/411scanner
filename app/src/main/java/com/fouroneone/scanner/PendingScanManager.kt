/**
 * @file: PendingScanManager.kt
 * @class: Class 1 (Focused Logic Component)
 * @cap: 80 Lines
 * @responsibility:
 * Persist the client-generated scan request ID across navigation, process
 * death, and app restart so an interrupted scan can be resumed via
 * getScanResult polling instead of being lost.
 *
 * @security_gate:
 * Stores only the opaque request UUID. No image data, no OCR text, no
 * user identity. The server owns the result; this is just the lookup key.
 *
 * @owner_context:
 * 411 Scanner resumable-scan guarantee: once the specimen is in the tray
 * and the scan button is pressed, the scan must survive. The user never
 * worries about losing a scan or getting disconnected.
 */

package com.fouroneone.scanner

import android.content.Context
import android.util.Log

object PendingScanManager {

    private const val TAG = "411_PendingScan"
    private const val PREFS = "pending_scan_prefs"
    private const val KEY_REQUEST_ID = "pending_request_id"
    private const val KEY_STARTED_AT = "pending_started_at"

    /**
     * Save the request ID when a scan begins. Called before the network
     * request so even an immediate interruption is recoverable.
     */
    fun savePending(context: Context, requestId: String) {
        try {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_REQUEST_ID, requestId)
                .putLong(KEY_STARTED_AT, System.currentTimeMillis())
                .apply()
            Log.d(TAG, "Pending scan saved: $requestId")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to save pending scan", e)
        }
    }

    /**
     * Returns the pending request ID, or null if none exists or it is
     * too old to be worth polling (older than 30 minutes — the server
     * will have finished or timed out by then).
     */
    fun getPending(context: Context): String? {
        return try {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val requestId = prefs.getString(KEY_REQUEST_ID, null)
            val startedAt = prefs.getLong(KEY_STARTED_AT, 0L)

            if (requestId.isNullOrBlank()) return null

            // Stale after 30 minutes — server-side result has expired.
            if (System.currentTimeMillis() - startedAt > 30 * 60 * 1000L) {
                Log.d(TAG, "Pending scan expired, clearing: $requestId")
                clearPending(context)
                return null
            }

            requestId
        } catch (e: Exception) {
            Log.w(TAG, "Failed to read pending scan", e)
            null
        }
    }

    /**
     * Clear the pending scan. Called on successful delivery, definitive
     * failure, or when the user starts a fresh scan.
     */
    fun clearPending(context: Context) {
        try {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .remove(KEY_REQUEST_ID)
                .remove(KEY_STARTED_AT)
                .apply()
            Log.d(TAG, "Pending scan cleared")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to clear pending scan", e)
        }
    }
}
