package com.fouroneone.scanner

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.browser.customtabs.CustomTabsIntent

/**
 * The one way the app opens a link from a report. Report links open web
 * pages, never files: on 10/14 a report link pointed at our own test APK
 * and tapping it started a download. Every report link goes through here
 * (Inspect Source, Alternatives, reporting portals).
 *
 * Links open in an in-app browser tab (Custom Tab), not the phone
 * browser's current tab: that tab carries the user's own history (test APK
 * downloads, offer pages from scanned ads), which replayed on open and on
 * Back. A Custom Tab starts clean, and Back returns to the report.
 */
object SafeLinks {

    /** Opens [url] in the browser if it's a web page. Returns false if refused. */
    fun openWebPage(context: Context, url: String): Boolean {
        val host = runCatching { Uri.parse(url.trim()).host }.getOrNull() ?: "?"
        if (!isInspectableTechnicalSource(url)) {
            AppLog.event("link") { "refused non-page url host=$host" }
            Toast.makeText(
                context,
                "That link is a file download, not a web page, so it wasn't opened.",
                Toast.LENGTH_SHORT
            ).show()
            return false
        }
        AppLog.event("link") { "open host=$host" }
        val uri = Uri.parse(url.trim())
        return try {
            CustomTabsIntent.Builder()
                .setShowTitle(true)
                .build()
                .launchUrl(context, uri)
            true
        } catch (_: Exception) {
            // No Custom Tabs browser installed: plain browser intent.
            try {
                context.startActivity(
                    Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
                return true
            } catch (_: Exception) { }
            Toast.makeText(context, "Couldn't open the browser.", Toast.LENGTH_SHORT).show()
            false
        }
    }
}
