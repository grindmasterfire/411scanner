package com.fouroneone.scanner

import android.app.Activity
import android.content.Context
import android.util.Log
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Manages Google Play Billing lifecycle, product detail querying, and purchase flows.
 */
object BillingManager : PurchasesUpdatedListener {

    private const val TAG = "411_BillingManager"

    // Subscription products (7 final — must match Play Console and server PRODUCT_MAP).
    // Rental weekly is the $3.99 short-term pass (server aliases standard_weekly -> rental).
    const val PRODUCT_STANDARD_WEEKLY = "standard_weekly"
    const val PRODUCT_STANDARD_MONTHLY = "standard_monthly"
    const val PRODUCT_STANDARD_ANNUAL = "standard_annual"
    const val PRODUCT_PRO_MONTHLY = "pro_monthly"
    const val PRODUCT_PRO_ANNUAL = "pro_annual"
    const val PRODUCT_FAMILY_MONTHLY = "family_monthly"
    const val PRODUCT_FAMILY_ANNUAL = "family_annual"
    // Top-up products (consumables — server TOPUP_MAP; purchase UI lands post-launch).
    const val PRODUCT_TOPUP_5 = "topup_5"
    const val PRODUCT_TOPUP_10 = "topup_10"
    const val PRODUCT_TOPUP_20 = "topup_20"
    const val PRODUCT_TOPUP_FAMILY_25 = "topup_family_25"

    private var billingClient: BillingClient? = null
    private var appContext: Context? = null
    private val billingScope = CoroutineScope(Dispatchers.IO)

    private val _isConnected = MutableStateFlow(false)
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private val _productDetailsMap = MutableStateFlow<Map<String, ProductDetails>>(emptyMap())
    val productDetailsMap: StateFlow<Map<String, ProductDetails>> = _productDetailsMap.asStateFlow()

    fun initialize(context: Context) {
        if (billingClient != null) return
        appContext = context.applicationContext

        val pendingPurchasesParams = PendingPurchasesParams.newBuilder()
            .enableOneTimeProducts()
            .build()

        billingClient = BillingClient.newBuilder(context.applicationContext)
            .setListener(this)
            .enablePendingPurchases(pendingPurchasesParams)
            .build()

        startConnection()
    }

    private fun startConnection() {
        billingClient?.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(billingResult: BillingResult) {
                if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                    Log.d(TAG, "Billing client successfully connected.")
                    _isConnected.value = true
                    queryAllProducts()
                    queryActivePurchases()
                } else {
                    Log.w(TAG, "Billing setup failed: ${billingResult.debugMessage}")
                    _isConnected.value = false
                }
            }

            override fun onBillingServiceDisconnected() {
                Log.w(TAG, "Billing service disconnected, attempting reconnect...")
                _isConnected.value = false
            }
        })
    }

    private fun queryAllProducts() {
        val client = billingClient ?: return
        if (!client.isReady) return

        // Subscriptions (7 final) + top-up consumables (INAPP).
        fun sub(id: String) = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(id)
            .setProductType(BillingClient.ProductType.SUBS)
            .build()
        fun inApp(id: String) = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(id)
            .setProductType(BillingClient.ProductType.INAPP)
            .build()

        val inAppProductList = listOf(
            inApp(PRODUCT_TOPUP_5), inApp(PRODUCT_TOPUP_10),
            inApp(PRODUCT_TOPUP_20), inApp(PRODUCT_TOPUP_FAMILY_25)
        )

        val subProductList = listOf(
            sub(PRODUCT_STANDARD_WEEKLY), sub(PRODUCT_STANDARD_MONTHLY), sub(PRODUCT_STANDARD_ANNUAL),
            sub(PRODUCT_PRO_MONTHLY), sub(PRODUCT_PRO_ANNUAL),
            sub(PRODUCT_FAMILY_MONTHLY), sub(PRODUCT_FAMILY_ANNUAL)
        )

        val paramsInApp = QueryProductDetailsParams.newBuilder()
            .setProductList(inAppProductList)
            .build()

        val paramsSubs = QueryProductDetailsParams.newBuilder()
            .setProductList(subProductList)
            .build()

        // No INAPP products to query; go straight to subscriptions.
        run {
            val updatedMap = _productDetailsMap.value.toMutableMap()
            client.queryProductDetailsAsync(paramsSubs) { subResult, subsDetailsList ->
                if (subResult.responseCode == BillingClient.BillingResponseCode.OK) {
                    subsDetailsList.forEach { updatedMap[it.productId] = it }
                }
                _productDetailsMap.value = updatedMap
                Log.d(TAG, "Fetched ${updatedMap.size} product details from Google Play.")
            }
        }
    }

    fun launchPurchase(activity: Activity, productId: String, onFallbackGrant: () -> Unit) {
        val client = billingClient
        val details = _productDetailsMap.value[productId]

        if (client != null && client.isReady && details != null) {
            val productDetailsParamsList = when (details.productType) {
                BillingClient.ProductType.SUBS -> {
                    val offerToken = details.subscriptionOfferDetails?.firstOrNull()?.offerToken ?: ""
                    listOf(
                        BillingFlowParams.ProductDetailsParams.newBuilder()
                            .setProductDetails(details)
                            .setOfferToken(offerToken)
                            .build()
                    )
                }
                else -> {
                    listOf(
                        BillingFlowParams.ProductDetailsParams.newBuilder()
                            .setProductDetails(details)
                            .build()
                    )
                }
            }

            val flowParams = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(productDetailsParamsList)
                .build()

            client.launchBillingFlow(activity, flowParams)
        } else {
            Log.d(TAG, "Billing not fully configured/connected on Play Console. Applying fallback test entitlement.")
            onFallbackGrant()
        }
    }

    override fun onPurchasesUpdated(billingResult: BillingResult, purchases: MutableList<Purchase>?) {
        if (billingResult.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (purchase in purchases) {
                handlePurchase(purchase)
            }
        } else if (billingResult.responseCode == BillingClient.BillingResponseCode.USER_CANCELED) {
            Log.d(TAG, "User canceled billing flow.")
        } else {
            Log.w(TAG, "Purchase update error: ${billingResult.debugMessage}")
        }
    }

    private fun handlePurchase(purchase: Purchase) {
        val context = appContext ?: return
        if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
            billingScope.launch {
                for (productId in purchase.products) {
                    // Interim device-side pass per billing period. The real
                    // per-user scan-bucket entitlement is written server-side.
                    when (productId) {
                        PRODUCT_STANDARD_WEEKLY ->
                            QuotaManager.grantRentalPass(context, hours = 24 * 7)
                        PRODUCT_STANDARD_MONTHLY, PRODUCT_PRO_MONTHLY, PRODUCT_FAMILY_MONTHLY ->
                            QuotaManager.grantRentalPass(context, hours = 24 * 30)
                        PRODUCT_STANDARD_ANNUAL, PRODUCT_PRO_ANNUAL, PRODUCT_FAMILY_ANNUAL ->
                            QuotaManager.grantRentalPass(context, hours = 24 * 365)
                    }
                    // Server-side: write the real scan-bucket entitlement for this UID.
                    grantEntitlementServerSide(productId, purchase.purchaseToken)
                }
            }

            if (!purchase.isAcknowledged) {
                val acknowledgeParams = AcknowledgePurchaseParams.newBuilder()
                    .setPurchaseToken(purchase.purchaseToken)
                    .build()
                billingClient?.acknowledgePurchase(acknowledgeParams) { result ->
                    Log.d(TAG, "Purchase acknowledged: ${result.responseCode}")
                }
            }
        }
    }

    private val grantHttpClient by lazy { OkHttpClient() }

    /*
     * Tell the backend to write this user's entitlement doc. Server verifies
     * identity from the Bearer ID token (and, once Play Console is set up, the
     * purchase token). Best-effort: a failure here leaves the interim device
     * grant in place; the server grant can be re-driven on next app open via
     * queryActivePurchases.
     */
    private suspend fun grantEntitlementServerSide(productId: String, purchaseToken: String) {
        val token = AuthManager.currentIdToken() ?: return  // guests can't own a sub
        try {
            val payload = JSONObject().apply {
                put("data", JSONObject().apply {
                    put("productId", productId)
                    put("purchaseToken", purchaseToken)
                })
            }
            val body = payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
            val req = Request.Builder()
                .url("https://us-central1-scanner-4ea67.cloudfunctions.net/grantEntitlement")
                .header("Authorization", "Bearer $token")
                .post(body)
                .build()
            grantHttpClient.newCall(req).execute().use { resp ->
                Log.d(TAG, "grantEntitlement response: ${resp.code}")
            }
        } catch (e: Exception) {
            Log.w(TAG, "grantEntitlement call failed: ${e.message}")
        }
    }

    private fun queryActivePurchases() {
        val client = billingClient ?: return
        val context = appContext ?: return
        if (!client.isReady) return

        val inAppParams = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.INAPP)
            .build()
        val subsParams = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.SUBS)
            .build()

        client.queryPurchasesAsync(inAppParams) { _, purchases ->
            purchases.filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }.forEach { handlePurchase(it) }
        }
        client.queryPurchasesAsync(subsParams) { _, purchases ->
            purchases.filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }.forEach { handlePurchase(it) }
        }
    }
}
