package com.app4clients.allinonebilltracker.billing

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

data class VerifyPurchaseRequest(
    val appUserId: String,
    val productId: String,
    val purchaseToken: String,
)

data class VerifyPurchaseResponse(
    val ok: Boolean,
    val premiumActive: Boolean,
    val productId: String?,
    val expiresAt: String?,
    val state: String?,
)

data class EntitlementResponse(
    val ok: Boolean,
    val premiumActive: Boolean,
    val productId: String?,
    val expiresAt: String?,
    val state: String?,
)

interface PremiumApiService {
    @POST("/api/billing/google-play/verify")
    suspend fun verifyPurchase(@Body body: VerifyPurchaseRequest): VerifyPurchaseResponse

    @GET("/api/billing/entitlement/{appUserId}")
    suspend fun getEntitlement(@Path("appUserId") appUserId: String): EntitlementResponse
}
