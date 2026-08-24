package com.fouroneone.scanner

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.widget.Toast

/**
 * Helper to handle incoming share intents, clipboard operations, and external portal navigation.
 */
object IntentHandler {

    fun extractImageUri(intent: Intent?): Uri? {
        if (intent == null) return null
        if (Intent.ACTION_SEND == intent.action && intent.type?.startsWith("image/") == true) {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
            }
        }
        return null
    }

    /**
     * Copies text payload to the system clipboard.
     */
    fun copyToClipboard(context: Context, label: String, text: String) {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        val clip = ClipData.newPlainText(label, text)
        clipboard?.setPrimaryClip(clip)
    }

    /**
     * Resolves the target agency URL based on archetype or endpoint metadata.
     */
    fun resolveAgencyUrl(endpoint: String, archetype: String): String {
        if (endpoint.isNotBlank() && (endpoint.startsWith("http://") || endpoint.startsWith("https://"))) {
            return endpoint
        }

        val upperArchetype = archetype.uppercase()
        return when {
            upperArchetype.contains("AD_FARM") || upperArchetype.contains("INCENTIVIZED") ->
                "https://support.google.com/googleplay/android-developer/contact/takedown"
            upperArchetype.contains("DRAINER") || upperArchetype.contains("CRYPTO") ->
                "https://www.ic3.gov/"
            upperArchetype.contains("HIGH_TICKET") || upperArchetype.contains("FUNNEL") || upperArchetype.contains("SUBSCRIPTION") ->
                "https://reportfraud.ftc.gov/"
            else ->
                "https://reportfraud.ftc.gov/"
        }
    }

    /**
     * Launches the regulatory portal via standard browser intent.
     */
    fun launchAgencyPortal(context: Context, url: String) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "Could not open browser: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }
}
