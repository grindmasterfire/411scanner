package com.fouroneone.scanner

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.ListenableWorker
import androidx.work.testing.TestListenableWorkerBuilder
import androidx.work.workDataOf
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Background-scan state: send once, show each outcome once, never give up
 * early. Professional runs several scans at once; every other tier one.
 */
@RunWith(RobolectricTestRunner::class)
class ScanJobStoreTest {

    private lateinit var context: Context

    private val input = ScanJobInput("aGVsbG8=", "ocr clue", AdProof.Ticket("ticket-1"))

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        ScanJobStore.clear(context)
    }

    private fun jobs() = ScanJobStore.observe(context).value

    private fun beginOne(id: String, now: Long = System.currentTimeMillis()) =
        ScanJobStore.begin(context, id, input, exclusive = true, now = now)

    private fun beginPro(id: String, now: Long = System.currentTimeMillis()) =
        ScanJobStore.begin(context, id, input, exclusive = false, now = now)

    @Test
    fun beginQueuesALiveScanWithItsInput() {
        beginOne("req-a")

        assertEquals(listOf(ScanJobState.Running("req-a", waiting = false)), jobs())
        assertEquals(ScanJobStore.Phase.QUEUED, ScanJobStore.phaseFor(context, "req-a"))
        assertEquals(input, ScanJobStore.readInput(context, "req-a"))
    }

    @Test
    fun aScanIsSubmittedAtMostOnce() {
        beginOne("req-a")

        assertTrue(ScanJobStore.markSubmitted(context, "req-a"))
        // A rerun after process death must poll, never resend.
        assertFalse(ScanJobStore.markSubmitted(context, "req-a"))
        assertEquals(ScanJobStore.Phase.SUBMITTED, ScanJobStore.phaseFor(context, "req-a"))
    }

    @Test
    fun deliveredOutcomeIsShownOnceThenGone() {
        beginOne("req-a")
        ScanJobStore.markSubmitted(context, "req-a")

        assertTrue(ScanJobStore.deliver(context, "req-a", "{\"report\":1}"))
        assertEquals(listOf(ScanJobState.Delivered("req-a", "{\"report\":1}")), jobs())
        // The specimen is deleted once the scan has an outcome.
        assertNull(ScanJobStore.readInput(context, "req-a"))

        ScanJobStore.acknowledge(context, "req-a")
        assertTrue(jobs().isEmpty())
        // Nothing left to resurrect on the next app open.
        assertTrue(ScanJobStore.claimForRecovery(context).isEmpty())
    }

    @Test
    fun failureIsShownOnceAndNeverComesBack() {
        beginOne("req-a")
        ScanJobStore.markSubmitted(context, "req-a")

        assertTrue(ScanJobStore.fail(context, "req-a", "30101", "declined"))
        assertEquals(listOf(ScanJobState.Failed("req-a", "30101", "declined")), jobs())
        // A late duplicate outcome for the same request is ignored.
        assertFalse(ScanJobStore.fail(context, "req-a", "30101", "declined"))
        assertFalse(ScanJobStore.deliver(context, "req-a", "{}"))

        ScanJobStore.acknowledge(context, "req-a")
        assertTrue(jobs().isEmpty())
        assertTrue(ScanJobStore.claimForRecovery(context).isEmpty())
    }

    @Test
    fun oneSlotTierNewScanReplacesTheOneInFlight() {
        beginOne("req-a")
        val replaced = beginOne("req-b")

        assertEquals(listOf("req-a"), replaced)
        assertFalse(ScanJobStore.markSubmitted(context, "req-a"))
        assertFalse(ScanJobStore.deliver(context, "req-a", "{}"))
        assertFalse(ScanJobStore.fail(context, "req-a", "30101", "x"))
        ScanJobStore.markWaiting(context, "req-a")
        assertFalse(ScanJobStore.expire(context, "req-a"))

        assertEquals(listOf(ScanJobState.Running("req-b", waiting = false)), jobs())
        assertNull(ScanJobStore.readInput(context, "req-a"))
    }

    @Test
    fun professionalRunsScansSideBySide() {
        assertTrue(beginPro("req-a", now = 1_000L).isEmpty())
        assertTrue(beginPro("req-b", now = 2_000L).isEmpty())

        assertEquals(
            listOf(
                ScanJobState.Running("req-a", waiting = false),
                ScanJobState.Running("req-b", waiting = false)
            ),
            jobs()
        )
        // Each specimen is kept for its own scan.
        assertEquals(input, ScanJobStore.readInput(context, "req-a"))
        assertEquals(input, ScanJobStore.readInput(context, "req-b"))
    }

    @Test
    fun professionalScansAreSentOnceEachIndependently() {
        beginPro("req-a")
        beginPro("req-b")

        assertTrue(ScanJobStore.markSubmitted(context, "req-a"))
        // req-a being sent says nothing about req-b.
        assertEquals(ScanJobStore.Phase.QUEUED, ScanJobStore.phaseFor(context, "req-b"))
        assertTrue(ScanJobStore.markSubmitted(context, "req-b"))
        assertFalse(ScanJobStore.markSubmitted(context, "req-a"))
        assertFalse(ScanJobStore.markSubmitted(context, "req-b"))
    }

    @Test
    fun professionalOutcomesAreDeliveredAndAcknowledgedPerScan() {
        beginPro("req-a", now = 1_000L)
        beginPro("req-b", now = 2_000L)
        ScanJobStore.markSubmitted(context, "req-a")
        ScanJobStore.markSubmitted(context, "req-b")

        ScanJobStore.deliver(context, "req-b", "{\"b\":1}")
        assertEquals(
            listOf(
                ScanJobState.Running("req-a", waiting = false),
                ScanJobState.Delivered("req-b", "{\"b\":1}")
            ),
            jobs()
        )

        ScanJobStore.acknowledge(context, "req-b")
        ScanJobStore.fail(context, "req-a", "30101", "declined")
        assertEquals(listOf(ScanJobState.Failed("req-a", "30101", "declined")), jobs())
    }

    @Test
    fun professionalScansExpireIndependently() {
        val day = ScanJobStore.RESULT_RETENTION_MS
        beginPro("req-old", now = 1_000L)
        beginPro("req-new", now = 1_000L + day / 2)
        ScanJobStore.markSubmitted(context, "req-old")
        ScanJobStore.markSubmitted(context, "req-new")
        ScanJobStore.ownedRequestIds.clear()

        val claimed = ScanJobStore.claimForRecovery(context, now = 1_000L + day)

        assertEquals(listOf("req-new"), claimed)
        assertEquals(
            listOf(
                ScanJobState.Failed("req-old", ScanJobStore.EXPIRED_CODE5, ScanJobStore.EXPIRED_MESSAGE),
                ScanJobState.Running("req-new", waiting = true)
            ),
            jobs()
        )
    }

    @Test
    fun appOpenRecoversAnUnfinishedScanFromADeadProcess() {
        beginOne("req-a")
        ScanJobStore.markSubmitted(context, "req-a")
        // Process death: nothing in this process owns the scan.
        ScanJobStore.ownedRequestIds.clear()

        assertEquals(listOf("req-a"), ScanJobStore.claimForRecovery(context))
        assertEquals(listOf(ScanJobState.Running("req-a", waiting = true)), jobs())
    }

    @Test
    fun appOpenDoesNotDowngradeALiveScanToWaiting() {
        beginOne("req-a")

        // MainActivity recreated while this process still runs the scan.
        assertEquals(listOf("req-a"), ScanJobStore.claimForRecovery(context))
        assertEquals(listOf(ScanJobState.Running("req-a", waiting = false)), jobs())
    }

    @Test
    fun aScanHoursOldIsStillFollowedNotCleared() {
        beginOne("req-a", now = 1_000L)
        ScanJobStore.markSubmitted(context, "req-a")
        ScanJobStore.ownedRequestIds.clear()

        // Come back the next day, inside the 24h retention: still there.
        val nextDay = 1_000L + 23 * 60 * 60 * 1000L
        assertEquals(listOf("req-a"), ScanJobStore.claimForRecovery(context, now = nextDay))
        assertEquals(listOf(ScanJobState.Running("req-a", waiting = true)), jobs())
    }

    @Test
    fun onlyThe24hRetentionEndsAScanAndItSaysSo() {
        beginOne("req-a", now = 1_000L)
        ScanJobStore.markSubmitted(context, "req-a")
        ScanJobStore.ownedRequestIds.clear()

        val later = 1_000L + ScanJobStore.RESULT_RETENTION_MS
        assertTrue(ScanJobStore.claimForRecovery(context, now = later).isEmpty())
        // One shown failure, not a silent clear.
        assertEquals(
            listOf(ScanJobState.Failed("req-a", ScanJobStore.EXPIRED_CODE5, ScanJobStore.EXPIRED_MESSAGE)),
            jobs()
        )
        ScanJobStore.acknowledge(context, "req-a")
        assertTrue(jobs().isEmpty())
    }

    @Test
    fun pastTheLiveWindowTheScanUnlocksTheScanner() {
        beginOne("req-a")
        ScanJobStore.markSubmitted(context, "req-a")

        ScanJobStore.markWaiting(context, "req-a")
        assertEquals(listOf(ScanJobState.Running("req-a", waiting = true)), jobs())
    }

    @Test
    fun noAdProofRoundTrips() {
        beginPro("req-a")
        beginPro("req-b")
        ScanJobStore.begin(context, "req-c", input.copy(adProof = AdProof.None), exclusive = false)
        ScanJobStore.begin(context, "req-d", input.copy(adProof = AdProof.NoFill), exclusive = false)

        assertEquals(AdProof.None, ScanJobStore.readInput(context, "req-c")?.adProof)
        assertEquals(AdProof.NoFill, ScanJobStore.readInput(context, "req-d")?.adProof)
    }

    @Test
    fun parallelDeliveriesBothLandInTheTray() {
        val report = { name: String ->
            "{\"consumer_card\":{\"target_name\":\"$name\"}}"
        }
        val threads = listOf("req-a" to "Alpha", "req-b" to "Bravo").map { (id, name) ->
            Thread { ScanHistoryManager.saveScan(context, report(name), id) }
        }
        ScanHistoryManager.clearHistory(context)
        threads.forEach { it.start() }
        threads.forEach { it.join() }

        val ids = ScanHistoryManager.getRecentScans(context).map { it.id }.toSet()
        assertEquals(setOf("req-a", "req-b"), ids)
    }

    @Test
    fun resendIsOnlyForAScanAlreadySentAndRecordsWhen() {
        beginOne("req-a", now = 1_000L)
        // Never sent: nothing to resend (the first send is markSubmitted).
        assertFalse(ScanJobStore.markResent(context, "req-a", now = 2_000L))

        assertTrue(ScanJobStore.markSubmitted(context, "req-a", now = 5_000L))
        assertEquals(5_000L, ScanJobStore.sentAt(context, "req-a"))
        assertTrue(ScanJobStore.markResent(context, "req-a", now = 40_000L))
        assertEquals(40_000L, ScanJobStore.sentAt(context, "req-a"))
        // The specimen is still there for the resend.
        assertEquals(input, ScanJobStore.readInput(context, "req-a"))

        ScanJobStore.deliver(context, "req-a", "{}")
        assertFalse(ScanJobStore.markResent(context, "req-a", now = 80_000L))
    }

    @Test
    fun resendOfARunningScanKeepsFollowingNotFailing() {
        val running = ScanErrorCodes.fromCallableError(
            409,
            "{\"error\":{\"message\":\"This scan is already running.\",\"details\":{\"inProgress\":true}}}"
        )
        assertTrue(running.outcomeUnknown)
        // A request ID owned by another account is a final refusal.
        val taken = ScanErrorCodes.fromCallableError(
            409,
            "{\"error\":{\"message\":\"This request ID is already in use.\"}}"
        )
        assertFalse(taken.outcomeUnknown)
    }

    @Test
    fun liveWindowCoversTheServerScanTimeout() {
        assertEquals(1_000L + 6 * 60 * 1000L, ScanWorker.liveWindowEnd(1_000L))
    }

    @Test
    fun followUpsSlowDownButNeverStop() {
        val min = 60 * 1000L
        assertEquals(min, ScanWorker.followUpDelayMs(10 * min))
        assertEquals(5 * min, ScanWorker.followUpDelayMs(60 * min))
        assertEquals(15 * min, ScanWorker.followUpDelayMs(20 * 60 * min))
    }

    @Test
    fun infrastructureErrorsKeepLookingServerAnswersAreFinal() {
        // Gateway timeout, no server code5: the scan may still finish.
        assertTrue(ScanErrorCodes.fromCallableError(504, "<html>Gateway Timeout</html>").outcomeUnknown)
        assertTrue(ScanErrorCodes.fromCallableError(502, null).outcomeUnknown)
        // The server said what happened (30101 rides on HTTP 503): final.
        val served = ScanErrorCodes.fromCallableError(
            503,
            "{\"error\":{\"message\":\"declined\",\"details\":{\"code5\":\"30101\"}}}"
        )
        assertFalse(served.outcomeUnknown)
        assertEquals("30101", served.code5)
        assertFalse(ScanErrorCodes.fromCallableError(400, null).outcomeUnknown)
    }

    @Test
    fun workerForAnUntrackedRequestDoesNothing() = runBlocking {
        beginOne("req-b")

        val worker = TestListenableWorkerBuilder<ScanWorker>(context)
            .setInputData(workDataOf(ScanWorker.KEY_REQUEST_ID to "req-a"))
            .build()

        assertEquals(ListenableWorker.Result.success(), worker.doWork())
        // The tracked scan is untouched and was not sent.
        assertEquals(ScanJobStore.Phase.QUEUED, ScanJobStore.phaseFor(context, "req-b"))
    }
}
