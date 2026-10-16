package com.fouroneone.scanner

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Story 7.1 flicker (fire, 2026-10-16): a fresh install showed "3/3" from a
 * placeholder quota, then flipped to the real "1/1 FREE SCAN THIS WEEK".
 * Until the real quota is read, the badge says it's checking.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class QuotaBadgeTest {

    @get:Rule val compose = createComposeRule()

    @Test
    fun placeholderSaysChecking_neverMadeUpNumbers() {
        compose.setContent {
            MaterialTheme { QuotaHeaderBadge(QuotaStatus(maxWeeklyScans = 1, remainingScans = 1, loaded = false)) }
        }
        compose.onNodeWithText(QUOTA_CHECKING_LABEL).assertIsDisplayed()
        assertEquals(0, compose.onAllNodesWithTextSafe("3/3"))
    }

    @Test
    fun realFreeQuotaShowsOneAWeek() {
        compose.setContent {
            MaterialTheme { QuotaHeaderBadge(QuotaStatus(maxWeeklyScans = 1, remainingScans = 1)) }
        }
        compose.onNodeWithText("1/1 FREE SCAN THIS WEEK").assertIsDisplayed()
    }

    private fun androidx.compose.ui.test.junit4.ComposeContentTestRule.onAllNodesWithTextSafe(text: String): Int =
        onAllNodes(androidx.compose.ui.test.hasText(text, substring = true)).fetchSemanticsNodes().size
}
