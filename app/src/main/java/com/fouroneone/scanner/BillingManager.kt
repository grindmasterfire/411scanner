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

    // Standard tier (the paywall shows these in v1)
    const val PRODUCT_STANDARD_WEEKLY = "standard_weekly"
    const val PRODUCT_STANDARD_MONTHLY = "standard_monthly"
    const val PRODUCT_STANDARD_ANNUAL = "standard_annual"
    // Professional tier (products exist in Play; paywall UI wired in a later loop)
    const val PRODUCT_PRO_WEEKLY = "pro_weekly"
    const val PRODUCT_PRO_MONTHLY = "pro_monthly"
    const val PRODUCT_PRO_ANNUAL = "pro_annual"

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

        // All tiers are subscriptions now (no INAPP/lifetime).
        fun sub(id: String) = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(id)
            .setProductType(BillingClient.ProductType.SUBS)
            .build()

        val inAppProductList = emptyList<QueryProductDetailsParams.Product>()

        val subProductList = listOf(
            sub(PRODUCT_STANDARD_WEEKLY), sub(PRODUCT_STANDARD_MONTHLY), sub(PRODUCT_STANDARD_ANNUAL),
            sub(PRODUCT_PRO_WEEKLY), sub(PRODUCT_PRO_MONTHLY), sub(PRODUCT_PRO_ANNUAL)
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
                    // Interim: grant a timed pass per billing period. Real per-user
                    // scan-bucket entitlement moves server-side in Loop B.
                    when (productId) {
                        PRODUCT_STANDARD_WEEKLY, PRODUCT_PRO_WEEKLY ->
                            QuotaManager.grantRentalPass(context, hours = 24 * 7)
                        PRODUCT_STANDARD_MONTHLY, PRODUCT_PRO_MONTHLY ->
                            QuotaManager.grantRentalPass(context, hours = 24 * 30)
                        PRODUCT_STANDARD_ANNUAL, PRODUCT_PRO_ANNUAL ->
                            QuotaManager.grantRentalPass(context, hours = 24 * 365)
                    }
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
