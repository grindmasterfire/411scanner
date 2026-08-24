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

    const val PRODUCT_RENTAL_WEEKLY = "rental_weekly_399"
    const val PRODUCT_RENTAL_MONTHLY = "rental_monthly_799"
    const val PRODUCT_LIFETIME = "lifetime_pass_3599"

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

        val inAppProductList = listOf(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(PRODUCT_LIFETIME)
                .setProductType(BillingClient.ProductType.INAPP)
                .build()
        )

        val subProductList = listOf(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(PRODUCT_RENTAL_WEEKLY)
                .setProductType(BillingClient.ProductType.SUBS)
                .build(),
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(PRODUCT_RENTAL_MONTHLY)
                .setProductType(BillingClient.ProductType.SUBS)
                .build()
        )

        val paramsInApp = QueryProductDetailsParams.newBuilder()
            .setProductList(inAppProductList)
            .build()

        val paramsSubs = QueryProductDetailsParams.newBuilder()
            .setProductList(subProductList)
            .build()

        client.queryProductDetailsAsync(paramsInApp) { result, inAppDetailsList ->
            val updatedMap = _productDetailsMap.value.toMutableMap()
            if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                inAppDetailsList.forEach { updatedMap[it.productId] = it }
            }
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
                    when (productId) {
                        PRODUCT_RENTAL_WEEKLY -> QuotaManager.grantRentalPass(context, hours = 24 * 7)
                        PRODUCT_RENTAL_MONTHLY -> QuotaManager.grantRentalPass(context, hours = 24 * 30)
                        PRODUCT_LIFETIME -> QuotaManager.grantLifetimeAccess(context)
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
