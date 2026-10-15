/**
 * @file: SpecimenViewer.kt
 * @class: Class 1 (Focused UI Component)
 * @cap: 150 Lines
 * @responsibility:
 * Full-screen view of the specimen in the scanner tray, so a person with
 * low vision can confirm it's the right screenshot before spending a scan.
 * Pinch or double-tap to zoom, drag to pan; large "Scan this" and "Choose a
 * different one" buttons act from here.
 *
 * @security_gate:
 * Presentation only. "Scan this" goes through the same onRunScan path as
 * the tray (ad gate, then the "Scan this specimen?" confirmation).
 *
 * @owner_context:
 * 411 Scanner accessibility (fire's request, 2026-10-15).
 */

package com.fouroneone.scanner

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

private const val MAX_ZOOM = 6f
private const val DOUBLE_TAP_ZOOM = 2.5f

@Composable
fun SpecimenViewer(
    bitmap: Bitmap,
    canScan: Boolean,
    onScan: () -> Unit,
    onChooseAnother: () -> Unit,
    onClose: () -> Unit
) {
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }

    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black)
                .safeDrawingPadding()
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Pinch or double-tap to zoom",
                    color = Color.White,
                    fontSize = 16.sp,
                    modifier = Modifier.weight(1f).padding(start = 8.dp)
                )
                IconButton(onClick = onClose, modifier = Modifier.size(56.dp)) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "Close full-screen preview",
                        tint = Color.White,
                        modifier = Modifier.size(32.dp)
                    )
                }
            }

            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .pointerInput(Unit) {
                        detectTapGestures(onDoubleTap = { tap ->
                            if (scale > 1f) {
                                scale = 1f
                                offset = Offset.Zero
                            } else {
                                scale = DOUBLE_TAP_ZOOM
                                // Zoom toward the tapped spot.
                                offset = (Offset(size.width / 2f, size.height / 2f) - tap) * (DOUBLE_TAP_ZOOM - 1f)
                            }
                        })
                    }
                    .pointerInput(Unit) {
                        detectTransformGestures { _, pan, zoom, _ ->
                            scale = (scale * zoom).coerceIn(1f, MAX_ZOOM)
                            offset = if (scale == 1f) Offset.Zero else offset + pan
                        }
                    },
                contentAlignment = Alignment.Center
            ) {
                Image(
                    bitmap = bitmap.asImageBitmap(),
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxSize()
                        .semantics { contentDescription = "Your selected screenshot, full screen" }
                        .graphicsLayer(
                            scaleX = scale,
                            scaleY = scale,
                            translationX = offset.x,
                            translationY = offset.y
                        )
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedButton(
                    onClick = onChooseAnother,
                    modifier = Modifier.weight(1f).height(64.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White)
                ) {
                    Text("Choose a different one", fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                }
                Button(
                    onClick = onScan,
                    enabled = canScan,
                    modifier = Modifier.weight(1f).height(64.dp)
                ) {
                    Text("Scan this", fontSize = 20.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
