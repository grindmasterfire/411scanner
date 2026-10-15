package com.fouroneone.scanner

import android.annotation.SuppressLint
import android.content.Context
import android.provider.Settings
import java.security.MessageDigest

/**
 * A stable, one-way key for this device, sent with scans and quota checks
 * so the weekly free scan belongs to the device as well as the account.
 * Clearing app data signs in a brand-new anonymous user; the Android ID
 * (per app signing key, per device user) survives that and reinstalls, and
 * only changes on a factory reset. Only a SHA-256 of it ever leaves the
 * phone, and the server hashes it again before storing.
 */
object DeviceKey {
    @Volatile
    private var cached: String? = null

    /** Call once with any context; later reads use [value]. */
    @SuppressLint("HardwareIds")
    fun init(context: Context) {
        if (cached != null) return
        val androidId = runCatching {
            Settings.Secure.getString(context.applicationContext.contentResolver, Settings.Secure.ANDROID_ID)
        }.getOrNull()
        if (androidId.isNullOrBlank()) return
        val digest = MessageDigest.getInstance("SHA-256")
            .digest("${context.packageName}:$androidId".toByteArray())
        cached = digest.joinToString("") { "%02x".format(it) }
    }

    /** The 64-hex-char key, or null when the Android ID was unavailable. */
    val value: String? get() = cached
}
