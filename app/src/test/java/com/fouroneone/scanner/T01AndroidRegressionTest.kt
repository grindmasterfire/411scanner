package com.fouroneone.scanner

import org.json.JSONArray
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@RunWith(RobolectricTestRunner::class)
class T01AndroidRegressionTest {

    @Test
    fun canonicalMetricsWinIncludingZero() {
        val metrics =
            JSONObject()
                .put("practical_utility", 0)
                .put("offline_independence", 9)
                .put("honest_business_model", 8)
                .put("honest_pricing", 1)

        val notes =
            JSONObject()
                .put("practical_utility_note", "canonical practical")
                .put("offline_independence_note", "legacy practical")
                .put("honest_business_model_note", "canonical honest")
                .put("honest_pricing_note", "legacy honest")

        val report =
            JSONObject().put(
                "consumer_card",
                JSONObject()
                    .put("metrics", metrics)
                    .put("metric_annotations", notes)
            )

        val card =
            ScanReportSectionParser.parseConsumerCard(report)

        assertEquals(0, card.metrics.practicalUtility)
        assertEquals(8, card.metrics.honestBusinessModel)
        assertEquals(
            "canonical practical",
            card.metricAnnotations.practicalUtilityNote
        )
        assertEquals(
            "canonical honest",
            card.metricAnnotations.honestBusinessModelNote
        )
    }

    @Test
    fun unusableCanonicalMetricsFallBackToLegacy() {
        val metrics =
            JSONObject()
                .put("practical_utility", "bad")
                .put("offline_independence", 6)
                .put("honest_business_model", JSONObject.NULL)
                .put("honest_pricing", 7)

        val notes =
            JSONObject()
                .put("practical_utility_note", JSONObject.NULL)
                .put("offline_independence_note", "legacy practical")
                .put("honest_business_model_note", JSONObject.NULL)
                .put("honest_pricing_note", "legacy honest")

        val report =
            JSONObject().put(
                "consumer_card",
                JSONObject()
                    .put("metrics", metrics)
                    .put("metric_annotations", notes)
            )

        val card =
            ScanReportSectionParser.parseConsumerCard(report)

        assertEquals(6, card.metrics.practicalUtility)
        assertEquals(7, card.metrics.honestBusinessModel)
        assertEquals(
            "legacy practical",
            card.metricAnnotations.practicalUtilityNote
        )
        assertEquals(
            "legacy honest",
            card.metricAnnotations.honestBusinessModelNote
        )
    }

    @Test
    fun inspectSourceRejectsProviderRedirectWall() {
        assertTrue(
            isInspectableTechnicalSource(
                "https://example.gov/record/123"
            )
        )

        assertFalse(
            isInspectableTechnicalSource(
                "https://vertexaisearch.cloud.google.com/" +
                    "grounding-api-redirect/example"
            )
        )

        assertFalse(
            isInspectableTechnicalSource("not-a-url")
        )
    }

    @Test
    fun attributionIdentifiersSurviveParsing() {
        val attribution =
            JSONObject()
                .put(
                    "aliases",
                    JSONArray().put("Alias One")
                )
                .put(
                    "company_registration_ids",
                    JSONArray().put("REG-123")
                )
                .put(
                    "license_identifiers",
                    JSONArray().put("LIC-456")
                )

        val parsed =
            TechnicalAttributionParser.parseAttribution(
                JSONObject().put(
                    "attribution",
                    attribution
                )
            )

        assertEquals(
            listOf("Alias One"),
            parsed.aliases
        )
        assertEquals(
            listOf("REG-123"),
            parsed.companyRegistrationIds
        )
        assertEquals(
            listOf("LIC-456"),
            parsed.licenseIdentifiers
        )
    }
}
