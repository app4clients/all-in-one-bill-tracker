package com.allinone.billtracker.billing

import android.app.Activity
import com.android.billingclient.api.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class GooglePlayBillingManager(
    private val activity: Activity,
    private val appUserId: String,
    private val api: PremiumApiService,
    private val onOffersLoaded: (List<ProductDetails>) -> Unit,
    private val onPremiumStateChanged: (Boolean, String?) -> Unit,
    private val onError: (String) -> Unit,
) : PurchasesUpdatedListener {

    private val ioScope = CoroutineScope(Dispatchers.IO)

    private val billingClient: BillingClient = BillingClient.newBuilder(activity)
        .setListener(this)
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()
        )
        .build()

    fun connectAndLoadOffers() {
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    queryOffers()
                    queryExistingPurchases()
                } else {
                    onError("Billing setup failed: ${result.debugMessage}")
                }
            }

            override fun onBillingServiceDisconnected() {
                onError("Billing service disconnected")
            }
        })
    }

    private fun queryOffers() {
        val products = BillingProducts.all.map {
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(it)
                .setProductType(BillingClient.ProductType.SUBS)
                .build()
        }

        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(products)
            .build()

        billingClient.queryProductDetailsAsync(params) { result, productDetailsList ->
            if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                onOffersLoaded(productDetailsList)
            } else {
                onError("Offer query failed: ${result.debugMessage}")
            }
        }
    }

    fun launchPurchase(productDetails: ProductDetails) {
        val offerToken = productDetails.subscriptionOfferDetails
            ?.firstOrNull()
            ?.offerToken

        if (offerToken == null) {
            onError("No subscription offer token available")
            return
        }

        val productParams = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(productDetails)
            .setOfferToken(offerToken)
            .build()

        val flowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(productParams))
            .build()

        val result = billingClient.launchBillingFlow(activity, flowParams)
        if (result.responseCode != BillingClient.BillingResponseCode.OK) {
            onError("Unable to launch purchase: ${result.debugMessage}")
        }
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        when (result.responseCode) {
            BillingClient.BillingResponseCode.OK -> {
                purchases.orEmpty().forEach { handlePurchase(it) }
            }
            BillingClient.BillingResponseCode.USER_CANCELED -> {
                onError("Purchase canceled by user")
            }
            else -> {
                onError("Purchase failed: ${result.debugMessage}")
            }
        }
    }

    private fun queryExistingPurchases() {
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.SUBS)
            .build()

        billingClient.queryPurchasesAsync(params) { result, purchases ->
            if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                purchases.forEach { handlePurchase(it) }
            }
        }
    }

    private fun handlePurchase(purchase: Purchase) {
        if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) {
            return
        }

        val token = purchase.purchaseToken ?: return
        val productId = purchase.products.firstOrNull() ?: return

        ioScope.launch {
            try {
                val verifyResponse = api.verifyPurchase(
                    VerifyPurchaseRequest(
                        appUserId = appUserId,
                        productId = productId,
                        purchaseToken = token,
                    )
                )

                if (verifyResponse.ok && verifyResponse.premiumActive) {
                    if (!purchase.isAcknowledged) {
                        acknowledgePurchase(token)
                    }

                    withContext(Dispatchers.Main) {
                        onPremiumStateChanged(true, verifyResponse.expiresAt)
                    }
                } else {
                    withContext(Dispatchers.Main) {
                        onPremiumStateChanged(false, verifyResponse.expiresAt)
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    onError("Server verification failed: ${e.message}")
                }
            }
        }
    }

    private suspend fun acknowledgePurchase(token: String) = withContext(Dispatchers.IO) {
        val params = AcknowledgePurchaseParams.newBuilder()
            .setPurchaseToken(token)
            .build()

        billingClient.acknowledgePurchase(params) { result ->
            if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                onError("Acknowledge failed: ${result.debugMessage}")
            }
        }
    }

    fun refreshEntitlementOnAppOpen() {
        ioScope.launch {
            try {
                val entitlement = api.getEntitlement(appUserId)
                withContext(Dispatchers.Main) {
                    onPremiumStateChanged(entitlement.premiumActive, entitlement.expiresAt)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    onError("Entitlement check failed: ${e.message}")
                }
            }
        }
    }

    fun disconnect() {
        billingClient.endConnection()
    }
}
