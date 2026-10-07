package com.fouroneone.scanner

import android.app.Activity
import android.content.Context
import android.telephony.TelephonyManager
import android.util.Log
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.rewardedinterstitial.RewardedInterstitialAd
import com.google.android.gms.ads.rewardedinterstitial.RewardedInterstitialAdLoadCallback
import java.util.Locale

/**
 * Manages Google Mobile Ads SDK initialization, geo-profitability filtering, and Rewarded Interstitial ad gating.
 * Enforces strict gate-before-execute on diagnostic scan triggers and +1 scan ad rewards.
 */
object AdManager {

    private const val TAG = "411_AdManager"

    // Google AdMob official sample Rewarded Interstitial test ad unit ID
    private const val SAMPLE_REWARDED_INTERSTITIAL_ID = "ca-app-pub-3940256099942544/5354046379"

    private val TIER_1_MARKET_CODES = setOf(
        "US", "CA", "GB", "AU", "NZ", "DE", "FR", "JP", "CH", "NL", "SE", "NO", "DK", "AT", "IE"
    )

    private var rewardedInterstitialAd: RewardedInterstitialAd? = null
    private var isAdLoading = false
    private var isInitialized = false

    /**
     * Determines whether the user is located in a high-eCPM Tier 1 market where rewarded ad revenue covers API scan costs.
     */
    fun isTier1Market(context: Context): Boolean {
        return try {
            val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
            val networkCountry = telephonyManager?.networkCountryIso?.uppercase(Locale.US)
            val simCountry = telephonyManager?.simCountryIso?.uppercase(Locale.US)
            val localeCountry = Locale.getDefault().country.uppercase(Locale.US)

            val resolvedCountry = when {
                !networkCountry.isNullOrBlank() -> networkCountry
                !simCountry.isNullOrBlank() -> simCountry
                else -> localeCountry
            }
            TIER_1_MARKET_CODES.contains(resolvedCountry)
        } catch (e: Exception) {
            true
        }
    }

    /**
     * Initializes MobileAds on a background thread and pre-fetches the first rewarded ad.
     */
    fun initialize(context: Context) {
        if (isInitialized) return
        MobileAds.initialize(context) { status ->
            Log.d(TAG, "AdMob MobileAds initialized: $status")
            isInitialized = true
            loadRewardedInterstitial(context)
        }
    }

    /**
     * Pre-loads a Rewarded Interstitial ad instance.
     */
    fun loadRewardedInterstitial(context: Context) {
        if (isAdLoading || rewardedInterstitialAd != null) return

        isAdLoading = true
        val adRequest = AdRequest.Builder().build()

        RewardedInterstitialAd.load(
            context,
            SAMPLE_REWARDED_INTERSTITIAL_ID,
            adRequest,
            object : RewardedInterstitialAdLoadCallback() {
                override fun onAdLoaded(ad: RewardedInterstitialAd) {
                    Log.d(TAG, "Rewarded Interstitial Ad successfully loaded.")
                    rewardedInterstitialAd = ad
                    isAdLoading = false
                }

                override fun onAdFailedToLoad(loadAdError: LoadAdError) {
                    Log.w(TAG, "Rewarded Interstitial failed to load: ${loadAdError.message}")
                    rewardedInterstitialAd = null
                    isAdLoading = false
                }
            }
        )
    }

    /**
     * Displays the Rewarded Interstitial ad.
     * Guarantees scan execution or reward credit occurs strictly on user reward or as fallback if ad display fails.
     */
    fun showRewardedGate(
        activity: Activity,
        onRewardEarned: () -> Unit,
        onAdUnavailable: () -> Unit,
        onAdDismissedEarly: () -> Unit = onAdUnavailable
    ) {
        val currentAd = rewardedInterstitialAd
        if (currentAd != null) {
            var rewardGranted = false

            currentAd.fullScreenContentCallback = object : FullScreenContentCallback() {
                override fun onAdDismissedFullScreenContent() {
                    Log.d(TAG, "Rewarded ad dismissed.")
                    rewardedInterstitialAd = null
                    loadRewardedInterstitial(activity.applicationContext)
                    if (rewardGranted) {
                        onRewardEarned()
                    } else {
                        onAdDismissedEarly()
                    }
                }

                override fun onAdFailedToShowFullScreenContent(adError: AdError) {
                    Log.w(TAG, "Rewarded ad failed to show: ${adError.message}")
                    rewardedInterstitialAd = null
                    loadRewardedInterstitial(activity.applicationContext)
                    onAdUnavailable()
                }
            }

            currentAd.show(activity) { rewardItem ->
                Log.d(TAG, "User earned reward: ${rewardItem.amount} ${rewardItem.type}")
                rewardGranted = true
            }
        } else {
            Log.d(TAG, "Rewarded ad unavailable, falling back directly to action.")
            loadRewardedInterstitial(activity.applicationContext)
            onAdUnavailable()
        }
    }
}