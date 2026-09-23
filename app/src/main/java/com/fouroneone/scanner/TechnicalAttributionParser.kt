/**
 * @file TechnicalAttributionParser.kt
 * @class Class 1
 * @cap 200 Lines
 * @responsibility Parse investigator attribution,
 * domain registration, and infrastructure.
 */

package com.fouroneone.scanner

import org.json.JSONObject

object TechnicalAttributionParser {

    fun parseAttribution(
        ledger: JSONObject
    ): TechnicalAttribution {
        val source =
            ledger.optJSONObject("attribution")
                ?: JSONObject()

        return TechnicalAttribution(
            operatorName =
                source.optString("operator_name", ""),
            legalEntity =
                source.optString("legal_entity", ""),
            developerOrPublisher =
                source.optString(
                    "developer_or_publisher",
                    ""
                ),
            storefrontName =
                source.optString("storefront_name", ""),
            storefrontId =
                source.optString("storefront_id", ""),
            packageOrBundleId =
                source.optString(
                    "package_or_bundle_id",
                    ""
                ),
            officialDomain =
                source.optString("official_domain", ""),
            relatedDomains =
                TechnicalJsonValues.stringList(
                    source.optJSONArray("related_domains")
                ),
            relatedApps =
                TechnicalJsonValues.stringList(
                    source.optJSONArray("related_apps")
                ),
            contactEmails =
                TechnicalJsonValues.stringList(
                    source.optJSONArray("contact_emails")
                ),
            contactPhones =
                TechnicalJsonValues.stringList(
                    source.optJSONArray("contact_phones")
                ),
            businessAddresses =
                TechnicalJsonValues.stringList(
                    source.optJSONArray("business_addresses")
                ),
            paymentProcessors =
                TechnicalJsonValues.stringList(
                    source.optJSONArray("payment_processors")
                )
        )
    }

    fun parseDomainRegistration(
        ledger: JSONObject
    ): DomainRegistration {
        val source =
            ledger.optJSONObject("domain_registration")
                ?: JSONObject()

        return DomainRegistration(
            registrar =
                source.optString("registrar", ""),
            registeredOn =
                source.optString("registered_on", ""),
            updatedOn =
                source.optString("updated_on", ""),
            expiresOn =
                source.optString("expires_on", ""),
            registrantName =
                source.optString("registrant_name", ""),
            registrantOrganization =
                source.optString(
                    "registrant_organization",
                    ""
                ),
            registrantCountry =
                source.optString(
                    "registrant_country",
                    ""
                ),
            nameservers =
                TechnicalJsonValues.stringList(
                    source.optJSONArray("nameservers")
                )
        )
    }

    fun parseInfrastructure(
        ledger: JSONObject
    ): TechnicalInfrastructure {
        val source =
            ledger.optJSONObject("infrastructure")
                ?: JSONObject()

        return TechnicalInfrastructure(
            ipAddresses =
                TechnicalJsonValues.stringList(
                    source.optJSONArray("ip_addresses")
                ),
            asn =
                source.optString("asn", ""),
            hostingProvider =
                source.optString(
                    "hosting_provider",
                    ""
                ),
            cdn =
                source.optString("cdn", ""),
            tlsIssuer =
                source.optString("tls_issuer", ""),
            tlsSubject =
                source.optString("tls_subject", ""),
            tlsValidFrom =
                source.optString("tls_valid_from", ""),
            tlsValidTo =
                source.optString("tls_valid_to", "")
        )
    }
}
