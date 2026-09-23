/**
 * @file TechnicalLedgerParser.kt
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Orchestrate Technical 411 JSON parsing.
 */

package com.fouroneone.scanner

import org.json.JSONObject

object TechnicalLedgerParser {

    fun parse(
        report: JSONObject
    ): TechnicalLedger {
        val ledger =
            report.optJSONObject("technical_ledger")
                ?: JSONObject()

        return TechnicalLedger(
            attribution =
                TechnicalAttributionParser
                    .parseAttribution(ledger),

            domainRegistration =
                TechnicalAttributionParser
                    .parseDomainRegistration(ledger),

            infrastructure =
                TechnicalAttributionParser
                    .parseInfrastructure(ledger),

            networkTelemetry =
                TechnicalEvidenceParser
                    .parseNetwork(ledger),

            monetization =
                TechnicalEvidenceParser
                    .parseMonetization(ledger),

            regulatoryRecord =
                TechnicalEvidenceParser
                    .parseRegulatory(ledger),

            evidenceReceipts =
                TechnicalEvidenceParser
                    .parseReceipts(
                        ledger.optJSONArray(
                            "evidence_receipts"
                        )
                    ),

            technicalFlags =
                TechnicalJsonValues.stringList(
                    ledger.optJSONArray(
                        "technical_flags"
                    )
                ),

            complaintPattern =
                ledger.optString(
                    "complaint_pattern",
                    ""
                ),

            reviewSpread =
                ledger.optString(
                    "review_spread",
                    ""
                )
        )
    }
}
