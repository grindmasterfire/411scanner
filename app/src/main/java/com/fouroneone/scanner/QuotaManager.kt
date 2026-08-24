package com.fouroneone.scanner

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

val Context.quotaDataStore: DataStore<Preferences> by preferencesDataStore(name = "411_scan_quota")

data class QuotaStatus(
    val dailyScansUsed: Int,
    val maxDailyScans: Int = 3,
    val isLifetimeUnlocked: Boolean,
    val rentalExpiryTimestamp: Long,
    val remainingScans: Int,
    val isUnlimited: Boolean
)

/**
 * Manages daily scan quotas and paywall pass entitlements via Jetpack DataStore.
 */
object QuotaManager {

    private const val MAX_DAILY_SCANS = 3

    private val KEY_SCAN_COUNT = intPreferencesKey("daily_scan_count")
    private val KEY_LAST_SCAN_DATE = stringPreferencesKey("last_scan_date")
    private val KEY_LIFETIME_UNLOCKED = booleanPreferencesKey("is_lifetime_unlocked")
    private val KEY_RENTAL_EXPIRY = longPreferencesKey("rental_expiry_timestamp")
    private val KEY_RENTAL_SCAN_STREAK = intPreferencesKey("rental_scan_streak")

    private fun getTodayDateString(): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        return sdf.format(Date())
    }

    /**
     * Flow emitting the real-time quota entitlement state.
     */
    fun getQuotaStatusFlow(context: Context): Flow<QuotaStatus> {
        val today = getTodayDateString()
        return context.quotaDataStore.data.map { prefs ->
            val isLifetime = prefs[KEY_LIFETIME_UNLOCKED] ?: false
            val rentalExpiry = prefs[KEY_RENTAL_EXPIRY] ?: 0L
            val isRentalActive = System.currentTimeMillis() < rentalExpiry

            val lastDate = prefs[KEY_LAST_SCAN_DATE] ?: today
            val usedToday = if (lastDate == today) (prefs[KEY_SCAN_COUNT] ?: 0) else 0

            val isUnlimited = isLifetime || isRentalActive
            val remaining = if (isUnlimited) 999 else (MAX_DAILY_SCANS - usedToday).coerceAtLeast(0)

            QuotaStatus(
                dailyScansUsed = usedToday,
                maxDailyScans = MAX_DAILY_SCANS,
                isLifetimeUnlocked = isLifetime,
                rentalExpiryTimestamp = rentalExpiry,
                remainingScans = remaining,
                isUnlimited = isUnlimited
            )
        }
    }

    /**
     * Verifies if the user is entitled to perform a scan right now.
     */
    suspend fun canPerformScan(context: Context): Boolean {
        val today = getTodayDateString()
        val prefs = context.quotaDataStore.data.first()
        val isLifetime = prefs[KEY_LIFETIME_UNLOCKED] ?: false
        val rentalExpiry = prefs[KEY_RENTAL_EXPIRY] ?: 0L
        if (isLifetime || System.currentTimeMillis() < rentalExpiry) {
            return true
        }

        val lastDate = prefs[KEY_LAST_SCAN_DATE] ?: today
        val count = if (lastDate == today) (prefs[KEY_SCAN_COUNT] ?: 0) else 0
        return count < MAX_DAILY_SCANS
    }

    /**
     * Increments the scan count for today.
     */
    suspend fun recordScan(context: Context) {
        val today = getTodayDateString()
        context.quotaDataStore.edit { prefs ->
            val lastDate = prefs[KEY_LAST_SCAN_DATE] ?: today
            val currentCount = if (lastDate == today) (prefs[KEY_SCAN_COUNT] ?: 0) else 0
            prefs[KEY_LAST_SCAN_DATE] = today
            prefs[KEY_SCAN_COUNT] = currentCount + 1
        }
    }

    /**
     * Unlocks a 24-hour Rental Pass.
     */
    suspend fun grantRentalPass(context: Context, hours: Int = 24) {
        val expiry = System.currentTimeMillis() + (hours * 3600 * 1000L)
        context.quotaDataStore.edit { prefs ->
            prefs[KEY_RENTAL_EXPIRY] = expiry
        }
    }

    /**
     * Unlocks permanent Lifetime Pro access.
     */
    suspend fun grantLifetimeAccess(context: Context) {
        context.quotaDataStore.edit { prefs ->
            prefs[KEY_LIFETIME_UNLOCKED] = true
        }
    }

    /**
     * For rental pass users: bypasses ad for 2 scans, returns true on every 3rd scan.
     */
    suspend fun shouldShowAdForRental(context: Context): Boolean {
        var showAd = false
        context.quotaDataStore.edit { prefs ->
            val currentStreak = prefs[KEY_RENTAL_SCAN_STREAK] ?: 0
            if (currentStreak >= 2) {
                showAd = true
                prefs[KEY_RENTAL_SCAN_STREAK] = 0
            } else {
                showAd = false
                prefs[KEY_RENTAL_SCAN_STREAK] = currentStreak + 1
            }
        }
        return showAd
    }
}
