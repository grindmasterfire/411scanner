/**
 * @file TechnicalEvidenceSection.kt
 * @class Class 2
 * @cap 250 Lines
 * @responsibility Render Technical 411 receipts with
 * receipt-specific provider-grounded source inspection.
 */

package com.fouroneone.scanner

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun TechnicalEvidenceSection(
    receipts: List<TechnicalEvidenceReceipt>
) {
    if (receipts.isEmpty()) {
        return
    }

    val context =
        LocalContext.current

    Spacer(
        modifier = Modifier.height(10.dp)
    )

    Text(
        text = "EVIDENCE RECEIPTS",
        fontWeight = FontWeight.Bold
    )

    Spacer(
        modifier = Modifier.height(8.dp)
    )

    Column(
        verticalArrangement =
            Arrangement.spacedBy(10.dp)
    ) {
        receipts.forEach { receipt ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor =
                        MaterialTheme.colorScheme
                            .surfaceVariant
                )
            ) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement =
                        Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        text =
                            "${receipt.fieldLabel()} · " +
                            receipt.status.uppercase(),
                        fontWeight = FontWeight.Bold
                    )

                    Text(
                        text = receipt.displayFinding()
                    )

                    if (receipt.authority.isNotBlank()) {
                        ReceiptFact(
                            label = "Authority",
                            value = receipt.authority
                        )
                    }

                    if (receipt.subject.isNotBlank()) {
                        ReceiptFact(
                            label = "Subject",
                            value = receipt.subject
                        )
                    }

                    if (receipt.identifier.isNotBlank()) {
                        ReceiptFact(
                            label = "Identifier",
                            value = receipt.identifier
                        )
                    }

                    if (receipt.sourceTitle.isNotBlank()) {
                        ReceiptFact(
                            label = "Source",
                            value = receipt.sourceTitle
                        )
                    }

                    if (receipt.hasInspectableSource()) {
                        OutlinedButton(
                            onClick = {
                                context.startActivity(
                                    Intent(
                                        Intent.ACTION_VIEW,
                                        Uri.parse(
                                            receipt.sourceUrl
                                        )
                                    )
                                )
                            }
                        ) {
                            Text("Inspect Source")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ReceiptFact(
    label: String,
    value: String
) {
    Column {
        Text(
            text = label.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold
        )

        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall
        )
    }
}

private fun TechnicalEvidenceReceipt.fieldLabel():
    String =
    field
        .replace(".", " › ")
        .replace("_", " ")
        .uppercase()

private fun TechnicalEvidenceReceipt.displayFinding():
    String =
    finding.ifBlank {
        when (status.lowercase()) {
            "not_found" ->
                "Relevant research found no matching record."

            "not_applicable" ->
                "Not applicable."

            "unresolved" ->
                "Research could not resolve this field."

            "not_researched" ->
                "Not researched in this investigation."

            else ->
                "No finding supplied."
        }
    }

private fun TechnicalEvidenceReceipt.hasInspectableSource():
    Boolean =
    sourceUrl.startsWith("https://") ||
        sourceUrl.startsWith("http://")
