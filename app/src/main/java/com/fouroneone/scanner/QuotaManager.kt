package com.fouroneone.scanner

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.mapLatest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

val Context.quotaDataStore: DataStore<Preferences> by preferencesDataStore(name = "411_scan_quota")

data class QuotaStatus(
    val weeklyScansUsed: Int = 0,
    val maxWeeklyScans: Int = 1,
    val isTesterUnlimited: Boolean = false,
    val rentalExpiryTimestamp: Long = 0L,
    val remainingScans: Int = 1,
    val isUnlimited: Boolean = false,
    val serverQuota: ServerQuota? = null
)

/**
 * Free-tier scan quota (S4, locked 2026-10-07): 1 scan per week, gated by one
 * completed rewarded ad played BEFORE the scan executes. No completed ad,
 * no scan. Subscribers and the tester account never see the ad gate.
 *
 * Banked ad scans, daily quotas, and the device lifetime flag are gone —
 * none of them exist in the locked spec.
 */
object QuotaManager {

    /**
     * Test hook: this signed-in account gets unlimited scans for testing.
     * The email comes from Firebase Auth (verified Google sign-in), so it
     * cannot be spoofed client-side. Revisit before public launch if a
     * server-side tester flag is preferred.
     */
    private const val TESTER_UNLIMITED_EMAIL = "grindmasterfire@gmail.com"

    private val KEY_WEEKLY_SCAN_COUNT = intPreferencesKey("weekly_scan_count")
    private val KEY_LAST_SCAN_WEEK = stringPreferencesKey("last_scan_week")
    private val KEY_RENTAL_EXPIRY = longPreferencesKey("rental_expiry_timestamp")

    private fun getWeekKey(): String {
        val sdf = SimpleDateFormat("yyyy-ww", Locale.US)
        return sdf.format(Date())
    }

    /** Free tier: 1 scan per week. Spec rule — adjust bucket size, not price. */
    fun getMaxWeeklyScans(): Int = 1

    /** True when the signed-in user is the tester account. */
    fun isTesterUnlimited(): Boolean {
        val email = AuthManager.userState.value.email ?: return false
        return email.equals(TESTER_UNLIMITED_EMAIL, ignoreCase = true)
    }

    private fun isRentalActive(prefs: Preferences): Boolean {
        val rentalExpiry = prefs[KEY_RENTAL_EXPIRY] ?: 0L
        return System.currentTimeMillis() < rentalExpiry
    }

    /**
     * Flow emitting the real-time quota entitlement state.
     */
    fun getQuotaStatusFlow(context: Context): Flow<QuotaStatus> {
        // Combine DataStore with auth state: signing in, out, or switching
        // accounts must refresh the badge. DataStore alone never re-emits
        // on auth change, which left the old account's status on screen.
        // Server quota is fetched for signed-in paid users so the badge
        // can show the real bucket ("23/30") instead of a placeholder.
        val serverQuotaFlow: Flow<ServerQuota?> =
            AuthManager.userState.mapLatest {
                if (isTesterUnlimited()) null
                else QuotaRepository.fetchServerQuota()
            }
        return combine(
            context.quotaDataStore.data,
            AuthManager.userState,
            serverQuotaFlow
        ) { prefs, _, serverQuota ->
            val tester = isTesterUnlimited()
            val rentalActive = isRentalActive(prefs)
            val week = getWeekKey()

            val lastWeek = prefs[KEY_LAST_SCAN_WEEK] ?: week
            val usedThisWeek = if (lastWeek == week) (prefs[KEY_WEEKLY_SCAN_COUNT] ?: 0) else 0

            val unlimited = tester || rentalActive
            val remaining = if (unlimited) 999 else (getMaxWeeklyScans() - usedThisWeek).coerceAtLeast(0)

            QuotaStatus(
                weeklyScansUsed = usedThisWeek,
                maxWeeklyScans = getMaxWeeklyScans(),
                isTesterUnlimited = tester,
                rentalExpiryTimestamp = prefs[KEY_RENTAL_EXPIRY] ?: 0L,
                remainingScans = remaining,
                isUnlimited = unlimited,
                serverQuota = serverQuota
            )
        }
    }

    /**
     * Verifies if the user is entitled to perform a scan right now.
     * Tester and active subscribers: always. Free tier: 1/week.
     */
    suspend fun canPerformScan(context: Context): Boolean {
        if (isTesterUnlimited()) return true
        val prefs = context.quotaDataStore.data.first()
        if (isRentalActive(prefs)) return true

        val week = getWeekKey()
        val lastWeek = prefs[KEY_LAST_SCAN_WEEK] ?: week
        val count = if (lastWeek == week) (prefs[KEY_WEEKLY_SCAN_COUNT] ?: 0) else 0
        return count < getMaxWeeklyScans()
    }

    /**
     * Consumes one free-tier weekly scan.
     */
    suspend fun recordScan(context: Context) {
        val week = getWeekKey()
        context.quotaDataStore.edit { prefs ->
            val lastWeek = prefs[KEY_LAST_SCAN_WEEK] ?: week
            val currentCount = if (lastWeek == week) (prefs[KEY_WEEKLY_SCAN_COUNT] ?: 0) else 0
            prefs[KEY_LAST_SCAN_WEEK] = week
            prefs[KEY_WEEKLY_SCAN_COUNT] = currentCount + 1
        }
    }

    /**
     * Interim device-side pass for subscription purchases. The server writes
     * the real scan-bucket entitlement; this keeps the app usable offline.
     */
    suspend fun grantRentalPass(context: Context, hours: Int = 24) {
        val expiry = System.currentTimeMillis() + (hours * 3600 * 1000L)
        context.quotaDataStore.edit { prefs ->
            prefs[KEY_RENTAL_EXPIRY] = expiry
        }
    }
}
