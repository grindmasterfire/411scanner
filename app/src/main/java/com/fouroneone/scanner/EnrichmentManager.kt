package com.fouroneone.scanner

import kotlinx.coroutines.delay

/**
 * Data model representing enriched WHOIS and SSL forensic metadata.
 */
data class ForensicEnrichmentData(
    val registrar: String,
    val sslIssuer: String,
    val hostingCountry: String,
    val asn: String,
    val registrationDate: String,
    val lookupTimestamp: Long = System.currentTimeMillis()
)

/**
 * Sealed interface for lazy forensic enrichment network state.
 */
sealed interface EnrichmentState {
    data object Idle : EnrichmentState
    data object Loading : EnrichmentState
    data class Success(val data: ForensicEnrichmentData) : EnrichmentState
    data class Error(val message: String) : EnrichmentState
}

/**
 * Lightweight service managing on-demand forensic ledger enrichment.
 */
object EnrichmentManager {

    /**
     * Simulates an asynchronous forensic API lookup for WHOIS and SSL telemetry.
     */
    suspend fun fetchForensics(entityName: String): ForensicEnrichmentData {
        delay(1500) // Simulated network latency for forensic endpoint
        
        val sanitized = entityName.lowercase().replace(" ", "")
        val domain = if (sanitized.contains(".")) sanitized else "$sanitized.com"

        return ForensicEnrichmentData(
            registrar = "MarkMonitor, Inc. (IARA-292)",
            sslIssuer = "DigiCert Global Root G2 (TLS 1.3 / SHA-256)",
            hostingCountry = "US / Ashburn (AWS us-east-1)",
            asn = "AS16509 (AMAZON-02)",
            registrationDate = "2018-04-12"
        )
    }
}
