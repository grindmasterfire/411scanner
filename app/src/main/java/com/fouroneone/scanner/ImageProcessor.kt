package com.fouroneone.scanner

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.InputStream

/**
 * Utility for converting and compressing content URIs into Base64 strings.
 */
object ImageProcessor {

    suspend fun processUriToBase64(context: Context, uri: Uri): Pair<Bitmap?, String?> {
        return withContext(Dispatchers.IO) {
            try {
                val inputStream: InputStream? = context.contentResolver.openInputStream(uri)
                val bitmap = BitmapFactory.decodeStream(inputStream)
                inputStream?.close()

                if (bitmap != null) {
                    val outputStream = ByteArrayOutputStream()
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 85, outputStream)
                    val byteArray = outputStream.toByteArray()
                    val b64 = Base64.encodeToString(byteArray, Base64.NO_WRAP)
                    Pair(bitmap, b64)
                } else {
                    Pair(null, null)
                }
            } catch (e: Exception) {
                Pair(null, null)
            }
        }
    }
}
