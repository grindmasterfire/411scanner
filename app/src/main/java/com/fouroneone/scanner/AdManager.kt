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
import com.google.android.gms.ads.RequestConfiguration
import com.google.android.gms.ads.rewarded.ServerSideVerificationOptions
import com.google.android.gms.ads.rewardedinterstitial.RewardedInterstitialAd
import com.google.android.gms.ads.rewardedinterstitial.RewardedInterstitialAdLoadCallback
import java.util.Locale

/**
 * Manages Google Mobile Ads SDK initialization, geo-profitability filtering, and Rewarded Interstitial ad gating.
 * Enforces strict gate-before-execute on diagnostic scan triggers and +1 scan ad rewards.
 */
object AdManager {

    private const val TAG = "411_AdManager"

    // Production rewarded interstitial. Created 2026-10-07. Server-side
    // verification (admobSsv) is configured on this unit only.
    private const val PROD_REWARDED_INTERSTITIAL_ID = "ca-app-pub-1323472894046973/8930397909"

    /**
     * Debug builds request test ads on the PRODUCTION unit so the SSV
     * callback to our server can be tested end to end (Google's sample
     * unit never calls our server). Test ads never earn or bill, but ONLY
     * on registered test devices: register the phone in the AdMob console
     * (Settings > Test devices) or add its hashed id below — the SDK logs
     * it to logcat on the first ad request — before running a debug build.
     */
    private const val REWARDED_INTERSTITIAL_ID = PROD_REWARDED_INTERSTITIAL_ID

    private val DEBUG_TEST_DEVICE_IDS: List<String> = listOf(
        // "33BE2250B43518CCDA7DE426D04EE231",
    )

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
        if (BuildConfig.DEBUG) {
            MobileAds.setRequestConfiguration(
                RequestConfiguration.Builder()
                    .setTestDeviceIds(DEBUG_TEST_DEVICE_IDS)
                    .build()
            )
        }
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
            REWARDED_INTERSTITIAL_ID,
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
     *
     * Before showing, the ad is tagged with the Firebase uid and a fresh
     * single-use ticket. On reward, Google calls our admobSsv endpoint with
     * both, signed; the scan request then presents the same ticket. The
     * ticket reaches onRewardEarned only after the reward callback fired.
     */
    fun showRewardedGate(
        activity: Activity,
        userId: String,
        onRewardEarned: (adTicket: String) -> Unit,
        onAdUnavailable: () -> Unit,
        onAdDismissedEarly: () -> Unit = onAdUnavailable
    ) {
        val currentAd = rewardedInterstitialAd
        if (currentAd != null) {
            var rewardGranted = false
            val adTicket = java.util.UUID.randomUUID().toString()
            currentAd.setServerSideVerificationOptions(
                ServerSideVerificationOptions.Builder()
                    .setUserId(userId)
                    .setCustomData(adTicket)
                    .build()
            )

            currentAd.fullScreenContentCallback = object : FullScreenContentCallback() {
                override fun onAdDismissedFullScreenContent() {
                    Log.d(TAG, "Rewarded ad dismissed.")
                    rewardedInterstitialAd = null
                    loadRewardedInterstitial(activity.applicationContext)
                    if (rewardGranted) {
                        onRewardEarned(adTicket)
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