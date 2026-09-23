/**
 * @file TechnicalAttributionSection.kt
 * @class Class 2
 * @cap 250 Lines
 * @responsibility Render investigator-grade Technical 411 facts.
 */

package com.fouroneone.scanner

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun TechnicalAttributionSection(
    ledger: TechnicalLedger
) {
    FactGroup(
        title = "ATTRIBUTION",
        facts = listOf(
            "Operator" to
                ledger.attribution.operatorName,
            "Legal Entity" to
                ledger.attribution.legalEntity,
            "Developer / Publisher" to
                ledger.attribution.developerOrPublisher,
            "Storefront" to
                ledger.attribution.storefrontName,
            "Storefront ID" to
                ledger.attribution.storefrontId,
            "Package / Bundle" to
                ledger.attribution.packageOrBundleId,
            "Official Domain" to
                ledger.attribution.officialDomain,
            "Related Domains" to
                ledger.attribution.relatedDomains
                    .joinToString("\n"),
            "Related Apps" to
                ledger.attribution.relatedApps
                    .joinToString("\n"),
            "Contact Emails" to
                ledger.attribution.contactEmails
                    .joinToString("\n"),
            "Contact Phones" to
                ledger.attribution.contactPhones
                    .joinToString("\n"),
            "Business Addresses" to
                ledger.attribution.businessAddresses
                    .joinToString("\n"),
            "Payment Processors" to
                ledger.attribution.paymentProcessors
                    .joinToString("\n"),
            "Aliases" to
                ledger.attribution.aliases
                    .joinToString("\n"),
            "Company Registration IDs" to
                ledger.attribution.companyRegistrationIds
                    .joinToString("\n"),
            "License Identifiers" to
                ledger.attribution.licenseIdentifiers
                    .joinToString("\n")
        )
    )

    FactGroup(
        title = "DOMAIN REGISTRATION",
        facts = listOf(
            "Registrar" to
                ledger.domainRegistration.registrar,
            "Registered" to
                ledger.domainRegistration.registeredOn,
            "Updated" to
                ledger.domainRegistration.updatedOn,
            "Expires" to
                ledger.domainRegistration.expiresOn,
            "Registrant" to
                ledger.domainRegistration.registrantName,
            "Registrant Organization" to
                ledger.domainRegistration
                    .registrantOrganization,
            "Registrant Country" to
                ledger.domainRegistration.registrantCountry,
            "Nameservers" to
                ledger.domainRegistration.nameservers
                    .joinToString("\n")
        )
    )

    FactGroup(
        title = "INFRASTRUCTURE",
        facts = listOf(
            "IP Addresses" to
                ledger.infrastructure.ipAddresses
                    .joinToString("\n"),
            "ASN" to
                ledger.infrastructure.asn,
            "Hosting Provider" to
                ledger.infrastructure.hostingProvider,
            "CDN" to
                ledger.infrastructure.cdn,
            "TLS Issuer" to
                ledger.infrastructure.tlsIssuer,
            "TLS Subject" to
                ledger.infrastructure.tlsSubject,
            "TLS Valid From" to
                ledger.infrastructure.tlsValidFrom,
            "TLS Valid To" to
                ledger.infrastructure.tlsValidTo
        )
    )
}

@Composable
private fun FactGroup(
    title: String,
    facts: List<Pair<String, String>>
) {
    val visible =
        facts.filter {
            it.second.isNotBlank()
        }

    if (visible.isEmpty()) {
        return
    }

    Spacer(
        modifier = Modifier.height(10.dp)
    )

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor =
                MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement =
                Arrangement.spacedBy(10.dp)
        ) {
            Text(
                text = title,
                fontWeight = FontWeight.Bold
            )

            visible.forEach { (label, value) ->
                Column {
                    Text(
                        text = label.uppercase(),
                        style =
                            MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold
                    )

                    Text(
                        text = value,
                        style =
                            MaterialTheme.typography.bodyMedium
                    )
                }
            }
        }
    }
}
