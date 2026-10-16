package com.fouroneone.scanner

import androidx.test.core.app.ApplicationProvider
import android.content.Context
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Background Deep Dives: one in flight per report, its request ID kept for polling. */
@RunWith(RobolectricTestRunner::class)
class DeepDiveStoreTest {

    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun pending(key: String) = DeepDiveStore.Pending(
        cacheKey = key, requestId = "dd_req_$key", data = "{\"cacheKey\":\"$key\"}",
        targetName = "UAC", startedAt = 1L
    )

    @Test
    fun pendingKeepsTheRequestIdUntilItEnds() {
        val before = DeepDiveStore.changes.value
        DeepDiveStore.beginPending(context, pending("k1"))
        assertEquals("dd_req_k1", DeepDiveStore.pendingFor(context, "k1")?.requestId)
        assertTrue(DeepDiveStore.allPending(context).any { it.cacheKey == "k1" })
        assertTrue("an open report hears about it", DeepDiveStore.changes.value > before)
        DeepDiveStore.endPending(context, "k1")
        assertNull(DeepDiveStore.pendingFor(context, "k1"))
    }

    @Test
    fun aFailureIsShownOnceAndClearedByTheNextDive() {
        DeepDiveStore.setError(context, "k2", "Deep dive requires a top-up credit.\nReference code: 40201")
        assertEquals("Deep dive requires a top-up credit.\nReference code: 40201", DeepDiveStore.errorFor(context, "k2"))
        DeepDiveStore.beginPending(context, pending("k2"))
        assertNull("starting a new dive clears the old failure", DeepDiveStore.errorFor(context, "k2"))
    }

    @Test
    fun aDeliveredDiveIsSavedForThatReport() {
        DeepDiveStore.save(context, "k3", "THE FINDING\nPersonal data exposure…")
        assertEquals("THE FINDING\nPersonal data exposure…", DeepDiveStore.load(context, "k3"))
    }
}
