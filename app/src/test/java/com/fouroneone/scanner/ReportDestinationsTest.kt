package com.fouroneone.scanner

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Report button routing (fire 2026-10-16): the button opens the server's
 * doors for this violation type. Server side: `npm run business:doors`.
 */
@RunWith(RobolectricTestRunner::class)
class ReportDestinationsTest {

    private fun door(id: String, url: String) = JSONObject()
        .put("id", id).put("label", "Report to $id").put("url", url).put("why", "Because.")

    @Test
    fun parsesTheServersDoorsHttpsOnly() {
        val card = JSONObject().put("report_destinations", JSONArray()
            .put(door("ftc", "https://reportfraud.ftc.gov/"))
            .put(door("state_ag", "https://www.naag.org/find-my-ag/"))
            .put(door("bad", "javascript:alert(1)")))
        val doors = ScanReportSectionParser.parseReportDestinations(card)
        assertEquals(listOf("ftc", "state_ag"), doors.map { it.id })
        assertEquals("Because.", doors[0].why)
    }

    @Test
    fun oldReportsHaveNoDoorsAndKeepTheOldButton() {
        assertEquals(emptyList<ReportDestination>(), ScanReportSectionParser.parseReportDestinations(JSONObject()))
        assertEquals("Report to FTC", reportButtonLabel(0, "Report to FTC"))
    }

    @Test
    fun buttonSaysHowManyPlaces() {
        assertEquals("Report (3 places)", reportButtonLabel(3, "Report"))
        assertEquals("Report", reportButtonLabel(1, "Report to FTC"))
        assertEquals("Where to report this", REPORT_DOORS_TITLE)
    }
}
