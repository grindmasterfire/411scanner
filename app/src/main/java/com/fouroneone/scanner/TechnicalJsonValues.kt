/**
 * @file TechnicalJsonValues.kt
 * @class Class 1
 * @cap 100 Lines
 * @responsibility Shared Technical 411 JSON value helpers.
 */

package com.fouroneone.scanner

import org.json.JSONArray
import org.json.JSONObject

object TechnicalJsonValues {

    fun stringList(
        array: JSONArray?
    ): List<String> {
        if (array == null) return emptyList()

        val values = mutableListOf<String>()

        for (index in 0 until array.length()) {
            val value =
                array.optString(index, "").trim()

            if (value.isNotBlank()) {
                values.add(value)
            }
        }

        return values
    }

    fun nullableInt(
        source: JSONObject,
        key: String
    ): Int? =
        if (source.has(key) && !source.isNull(key)) {
            source.optInt(key)
        } else {
            null
        }

    fun nullableString(
        source: JSONObject,
        key: String
    ): String? =
        if (source.has(key) && !source.isNull(key)) {
            source.optString(key, "")
        } else {
            null
        }
}
