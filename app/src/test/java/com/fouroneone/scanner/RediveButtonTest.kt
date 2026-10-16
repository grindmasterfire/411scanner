package com.fouroneone.scanner

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Deep Dive button and credit guard (fire 2026-10-16): one button in one
 * place ("Would You Like To Know More?" → "Re-dive for a new credit?"),
 * a confirmation on EVERY dive, and the dive runs in the background.
 * Server side, each dive is a deepdive_requests row and a deepdive_receipts
 * row: `npm run business:dives -- today` (functions/).
 */
class RediveButtonTest {

    @Test
    fun oneButtonChangesInPlaceAndShowsCreditsLeft() {
        assertEquals("Would You Like To Know More? (3 left)", deepDiveButtonLabel(false, false, 3))
        assertEquals("Re-dive for an additional credit? (3 left)", deepDiveButtonLabel(true, false, 3))
        assertEquals("Re-dive for an additional credit? (unlimited)", deepDiveButtonLabel(true, false, 0, unlimited = true))
        assertEquals("Re-dive for an additional credit?", deepDiveButtonLabel(true, false, null))
        assertEquals("Deep Dive running…", deepDiveButtonLabel(true, true, 3))
    }

    @Test
    fun everyDiveAsksBeforeSpendingAndSaysWhatIsLeft() {
        assertEquals(
            "You have 3 top-up credits. This Deep Dive uses 1, leaving 2. Are you sure? Nothing is charged until you tap Run.",
            deepDiveCostLine(false, 3)
        )
        assertEquals(
            "You have 1 top-up credit. This Deep Dive uses 1, even if the new Deep Dive matches the one you have, leaving 0. " +
                "Are you sure? Nothing is charged until you tap Run.",
            deepDiveCostLine(true, 1)
        )
        assertTrue(deepDiveCostLine(true, null).startsWith("You are about to use 1 top-up credit, even if"))
        assertEquals("Tester account: this Deep Dive is not charged. Run it?", deepDiveCostLine(true, 0, unlimited = true))
        assertEquals("Run a Deep Dive?", deepDiveConfirmTitle(false))
        assertEquals("Run a new Deep Dive?", deepDiveConfirmTitle(true))
    }

    @Test
    fun anEmptyBankSaysSoInsteadOfOfferingRun() {
        assertTrue(deepDiveCostLine(false, 0).startsWith("You have no top-up credits left."))
        assertTrue(!canRunDeepDive(0, unlimited = false))
        assertTrue(canRunDeepDive(0, unlimited = true))
        assertTrue("unknown balance: the server still guards", canRunDeepDive(null, unlimited = false))
    }

    @Test
    fun runningNoteSaysYouCanLeave() {
        assertTrue(DEEP_DIVE_RUNNING_NOTE.contains("We'll notify you when it's ready"))
    }

    @Test
    fun notificationsNameTheTargetAndRouteToTheReport() {
        assertEquals("Deep Dive on UAC in progress…", DeepDiveNotifications.progressTitle("UAC"))
        assertEquals("Your Deep Dive on UAC is ready", DeepDiveNotifications.readyTitle("UAC"))
        assertEquals("Your Deep Dive is ready", DeepDiveNotifications.readyTitle(""))
        assertEquals("dd:abc123", DeepDiveNotifications.routeFor("abc123"))
    }

    @Test
    fun exceptionLabelReadsOneDecimal() {
        assertEquals(
            "8.4 for delete from device, with an exception.",
            infrastructureExceptionText(8.4, "DELETE FROM DEVICE")
        )
    }
}
