package com.fouroneone.scanner

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Stopgap top-up readout: label wording and the last-known-value cache. */
@RunWith(RobolectricTestRunner::class)
class TopUpBalanceTest {

    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun labelNamesTheBankAndCount() {
        assertEquals("Top-up bank: 12 scans", topUpBalanceLabel(TopUpBalance(12, isFamilyBank = false)))
        assertEquals("Top-up bank: 1 scan", topUpBalanceLabel(TopUpBalance(1, isFamilyBank = false)))
        assertEquals("Top-up bank: 0 scans", topUpBalanceLabel(TopUpBalance(0, isFamilyBank = false)))
        assertEquals("Family top-up bank: 25 scans", topUpBalanceLabel(TopUpBalance(25, isFamilyBank = true)))
    }

    @Test
    fun offlineShowsTheLastKnownValueForTheSameAccount() {
        TopUpBalanceCache.save(context, "uid-a", TopUpBalance(7, isFamilyBank = true))
        assertEquals(TopUpBalance(7, isFamilyBank = true), TopUpBalanceCache.load(context, "uid-a"))
    }

    @Test
    fun anotherAccountNeverSeesTheCachedBalance() {
        TopUpBalanceCache.save(context, "uid-a", TopUpBalance(7, isFamilyBank = false))
        assertNull(TopUpBalanceCache.load(context, "uid-b"))
    }
}
