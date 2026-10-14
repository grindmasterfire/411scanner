package com.fouroneone.scanner

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Required-infrastructure note: shown only when the server changed the meter. */
@RunWith(RobolectricTestRunner::class)
class InfrastructureExceptionTest {

    private fun card(block: JSONObject?) = JSONObject()
        .put("action_meter_score", 7.9)
        .put("verdict_label", "PROFESSIONAL CONSIDERATION ONLY")
        .apply { block?.let { put("required_infrastructure", it) } }

    private val applied = JSONObject()
        .put("status", "confirmed")
        .put("applied", true)
        .put("entity", "Dun & Bradstreet, Inc.")
        .put("evidence_based_score", 8.5)
        .put("evidence_based_verdict", "DELETE FROM DEVICE AND REPORT")
        .put("instructions", "Professional consideration. Every finding stands in full.")

    @Test
    fun appliedExceptionShowsOnlyTheExceptionLabel() {
        assertTrue(ScanReportSectionParser.parseInfrastructureException(card(applied)) != null)
        val text = infrastructureExceptionText(7.9, "PROFESSIONAL CONSIDERATION ONLY")
        assertEquals("7.9 for professional consideration only, with an exception.", text)
        // Owner ruling: the evidence-based score is never shown in the report.
        assertTrue(!text.contains("8.5"))
    }

    @Test
    fun cappedSevenNineNeverShowsTheReportButton() {
        // The server's D&B result: final 7.9, evidence-based 8.5 in the block.
        val report = JSONObject().put("consumer_card", card(applied))
        val parsed = ScanReportSectionParser.parseConsumerCard(report)
        assertEquals(7.9, parsed.actionMeterScore, 0.0)
        assertTrue(!showsReportButton(parsed.actionMeterScore))
    }

    @Test
    fun reportButtonFollowsTheLadder() {
        assertTrue(!showsReportButton(7.9))
        assertTrue(!showsReportButton(8.0))
        assertTrue(!showsReportButton(8.4))
        assertTrue(showsReportButton(8.5))
        assertTrue(showsReportButton(9.0))
        assertTrue(showsReportButton(10.0))
    }

    @Test
    fun candidateBlockedOrUnappliedShowNothing() {
        assertNull(ScanReportSectionParser.parseInfrastructureException(card(null)))
        assertNull(ScanReportSectionParser.parseInfrastructureException(card(JSONObject(applied.toString()).put("applied", false))))
        assertNull(ScanReportSectionParser.parseInfrastructureException(card(JSONObject().put("status", "candidate"))))
        assertNull(ScanReportSectionParser.parseInfrastructureException(card(JSONObject().put("status", "blocked"))))
    }
}
