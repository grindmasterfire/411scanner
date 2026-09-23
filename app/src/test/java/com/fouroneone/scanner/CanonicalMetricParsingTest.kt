package com.fouroneone.scanner

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class CanonicalMetricParsingTest {

    @Test
    fun canonicalMetricsAndNotesSurviveParsing() {
        val json = """
            {
              "result": {
                "report": {
                  "consumer_card": {
                    "target_name": "TEST",
                    "metrics": {
                      "financial_risk": 10,
                      "personal_data_exposure": 7,
                      "wasted_time_and_ads": 8,
                      "real_substance": 1,
                      "practical_utility": 1,
                      "honest_business_model": 0
                    },
                    "metric_annotations": {
                      "financial_risk_note": "",
                      "personal_data_note": "",
                      "wasted_time_note": "",
                      "real_substance_note": "",
                      "practical_utility_note":
                        "Canonical practical note",
                      "honest_business_model_note":
                        "Canonical honest note"
                    }
                  }
                }
              }
            }
        """.trimIndent()

        val report =
            ScanReport.fromJson(json)

        assertNotNull(report)

        val consumer =
            requireNotNull(report).consumerCard

        assertEquals(
            1,
            consumer.metrics.practicalUtility
        )

        assertEquals(
            0,
            consumer.metrics.honestBusinessModel
        )

        assertEquals(
            "Canonical practical note",
            consumer.metricAnnotations
                .practicalUtilityNote
        )

        assertEquals(
            "Canonical honest note",
            consumer.metricAnnotations
                .honestBusinessModelNote
        )
    }
}
