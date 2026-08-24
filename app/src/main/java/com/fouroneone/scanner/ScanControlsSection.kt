package com.fouroneone.scanner

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp

/**
 * Scan controls including photo picker, ad-gated scan trigger, clear action, and error alert.
 */
@Composable
fun ScanControlsSection(
    hasSelectedImage: Boolean,
    hasValidBase64: Boolean,
    isLoading: Boolean,
    isConverting: Boolean,
    scanError: String?,
    onPickImage: () -> Unit,
    onRunScan: () -> Unit,
    onClearImage: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Button(
            onClick = onPickImage,
            modifier = Modifier.fillMaxWidth().testTag("pick_image_button")
        ) {
            Icon(
                imageVector = Icons.Default.AddPhotoAlternate,
                contentDescription = null,
                modifier = Modifier.padding(end = 8.dp)
            )
            Text("Select Screenshot / Image")
        }

        if (hasSelectedImage) {
            Spacer(modifier = Modifier.height(8.dp))

            Button(
                onClick = onRunScan,
                enabled = hasValidBase64 && !isLoading && !isConverting,
                modifier = Modifier.fillMaxWidth().testTag("run_scan_button")
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp).padding(end = 8.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                        strokeWidth = 2.dp
                    )
                    Text("Running 411 Diagnostic...")
                } else {
                    Icon(
                        imageVector = Icons.Default.Search,
                        contentDescription = null,
                        modifier = Modifier.padding(end = 8.dp)
                    )
                    Text("Scan Image")
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            OutlinedButton(
                onClick = onClearImage,
                enabled = !isLoading,
                modifier = Modifier.fillMaxWidth().testTag("clear_image_button")
            ) {
                Text("Clear Image")
            }
        }

        if (scanError != null) {
            Spacer(modifier = Modifier.height(16.dp))
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer
                )
            ) {
                Text(
                    text = "Error: $scanError",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    modifier = Modifier.padding(16.dp)
                )
            }
        }
    }
}
