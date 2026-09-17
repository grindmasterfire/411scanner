/**
 * @file: ScanInputProcessor.kt
 * @class: Class 1 (Focused Logic Component)
 * @cap: 150 Lines
 * @responsibility:
 * Prepare one selected image for scanning by producing the preview bitmap,
 * JPEG Base64 transport payload, and optional on-device OCR clue.
 *
 * @dependencies:
 * Android Context/Uri/Bitmap, ImageProcessor, ImageTextExtractor.
 *
 * @security_gate:
 * This component prepares client input only. OCR remains a non-authoritative
 * Cache Bank clue and cannot establish solicitation identity, evidence,
 * freshness, or Action Meter output.
 *
 * @owner_context:
 * 411 Scanner Android scan-input preparation boundary.
 *
 * @failure_rule:
 * OCR failure never invalidates an otherwise usable image. Image conversion
 * remains authoritative for whether a scan payload can be produced.
 */

package com.fouroneone.scanner

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri

data class PreparedScanInput(
    val bitmap: Bitmap?,
    val base64Image: String?,
    val ocrText: String
)

object ScanInputProcessor {

    suspend fun prepare(
        context: Context,
        uri: Uri
    ): PreparedScanInput {
        val (bitmap, base64Image) =
            ImageProcessor.processUriToBase64(
                context,
                uri
            )

        /*
         * ImageTextExtractor already fails soft to an empty string.
         * Keeping OCR optional here ensures Cache Bank optimization
         * can never become a prerequisite for the actual scan.
         */
        val ocrText =
            bitmap?.let {
                ImageTextExtractor.extractText(it)
            } ?: ""

        return PreparedScanInput(
            bitmap = bitmap,
            base64Image = base64Image,
            ocrText = ocrText
        )
    }
}
