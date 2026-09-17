/**
 * @file: ImageTextExtractor.kt
 * @class: Class 1 (Focused Logic Component)
 * @cap: 150 Lines
 * @responsibility:
 * Extract optional on-device OCR text from a prepared scan bitmap for
 * Cache Bank candidate discovery.
 *
 * @dependencies:
 * Android Bitmap, bundled ML Kit Text Recognition.
 *
 * @security_gate:
 * OCR is a non-authoritative retrieval clue only. It never establishes
 * solicitation identity, evidence, freshness, or Action Meter output.
 *
 * @owner_context:
 * 411 Scanner cheap pre-Gemini Cache Bank signal.
 *
 * @failure_rule:
 * OCR failure must never block a scan. Returning an empty string disables
 * cross-creative lookup while preserving the normal Gemini scan path.
 */

package com.fouroneone.scanner

import android.graphics.Bitmap
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

object ImageTextExtractor {

    /**
     * Returns normalized raw OCR text for transport to the server.
     *
     * The server performs tokenization and matching. Android intentionally
     * does not make identity or cache-reuse decisions from this text.
     */
    suspend fun extractText(bitmap: Bitmap): String {
        val recognizer =
            TextRecognition.getClient(
                TextRecognizerOptions.DEFAULT_OPTIONS
            )

        return try {
            val inputImage =
                InputImage.fromBitmap(
                    bitmap,
                    0
                )

            suspendCoroutine { continuation ->
                recognizer
                    .process(inputImage)
                    .addOnSuccessListener { result ->
                        continuation.resume(
                            result.text.trim()
                        )
                    }
                    .addOnFailureListener {
                        /*
                         * OCR is an optimization, not a prerequisite.
                         * Fail soft so Gemini scanning still works when
                         * text recognition cannot produce a result.
                         */
                        continuation.resume("")
                    }
            }
        } catch (_: Exception) {
            /*
             * Any setup/runtime OCR failure follows the same fail-open
             * rule: an empty clue is safer than blocking the user's scan.
             */
            ""
        } finally {
            recognizer.close()
        }
    }
}
