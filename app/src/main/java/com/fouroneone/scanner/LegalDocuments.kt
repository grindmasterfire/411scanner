package com.fouroneone.scanner

import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Description
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * In-app document surface (2026-10-07).
 *
 * The four user-facing documents live as public pages (GitHub Pages on
 * this repo) so there is a single source of truth that updates without
 * an app release. The Privacy Statement URL doubles as the Play Console
 * privacy-policy listing. Documents open in a Custom Tab (in-app).
 *
 * To publish: repo Settings → Pages → source "Deploy from a branch",
 * branch main, folder /docs. URLs below go live on first deploy.
 */
object LegalDocuments {

    private const val PAGES_BASE =
        "https://grindmasterfire.github.io/411scanner"

    const val USER_MANUAL_URL =
        "$PAGES_BASE/user-manual"
    const val TERMS_URL =
        "$PAGES_BASE/terms-of-service"
    const val PRIVACY_URL =
        "$PAGES_BASE/privacy-statement"
    const val LEGAL_URL =
        "$PAGES_BASE/legal-statement"

    data class Document(
        val title: String,
        val subtitle: String,
        val url: String
    )

    val ALL = listOf(
        Document(
            title = "User Manual",
            subtitle = "How scanning, scores, plans, and error codes work",
            url = USER_MANUAL_URL
        ),
        Document(
            title = "Terms of Service",
            subtitle = "The rules of using 411 Scanner",
            url = TERMS_URL
        ),
        Document(
            title = "Privacy Statement",
            subtitle = "What data we collect and why",
            url = PRIVACY_URL
        ),
        Document(
            title = "Legal Statement",
            subtitle = "Publisher, IP, and third-party services",
            url = LEGAL_URL
        )
    )

    /** Opens a document URL in an in-app Custom Tab. */
    fun open(context: Context, url: String) {
        val intent =
            CustomTabsIntent.Builder()
                .setShowTitle(true)
                .build()
        intent.launchUrl(
            context,
            Uri.parse(url)
        )
    }
}

/**
 * Bottom sheet listing the four documents. Each row opens its page
 * in a Custom Tab.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LegalDocumentsSheet(
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val sheetState = rememberModalBottomSheetState()

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(
                    horizontal = 20.dp,
                    vertical = 8.dp
                )
        ) {
            Text(
                text = "Documents",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 4.dp)
            )
            Text(
                text = "Guides and legal documents for 411 Scanner.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 12.dp)
            )

            LegalDocuments.ALL.forEach { doc ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            LegalDocuments.open(
                                context,
                                doc.url
                            )
                        }
                        .padding(vertical = 12.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Description,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(16.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = doc.title,
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = doc.subtitle,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

/**
 * Compact "Terms • Privacy" link row for dialogs (sign-in, paywall).
 * Keeps legal acceptance one tap away wherever the user commits.
 */
@Composable
fun LegalLinksRow(
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
    ) {
        TextButton(
            onClick = {
                LegalDocuments.open(
                    context,
                    LegalDocuments.TERMS_URL
                )
            }
        ) {
            Text(
                text = "Terms of Service",
                style = MaterialTheme.typography.bodySmall
            )
        }
        Text(
            text = "•",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 4.dp)
        )
        TextButton(
            onClick = {
                LegalDocuments.open(
                    context,
                    LegalDocuments.PRIVACY_URL
                )
            }
        ) {
            Text(
                text = "Privacy Statement",
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}
