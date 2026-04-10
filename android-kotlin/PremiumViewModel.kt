package com.allinone.billtracker.billing

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class PremiumUiState(
    val loading: Boolean = true,
    val premiumActive: Boolean = false,
    val premiumExpiresAt: String? = null,
    val selectedProductId: String? = null,
    val offers: List<com.android.billingclient.api.ProductDetails> = emptyList(),
    val message: String = "",
)

class PremiumViewModel : ViewModel() {
    private val _state = MutableStateFlow(PremiumUiState())
    val state: StateFlow<PremiumUiState> = _state.asStateFlow()

    fun onOffersLoaded(offers: List<com.android.billingclient.api.ProductDetails>) {
        _state.value = _state.value.copy(offers = offers, loading = false, message = "")
    }

    fun onPremiumChanged(active: Boolean, expiresAt: String?) {
        _state.value = _state.value.copy(
            premiumActive = active,
            premiumExpiresAt = expiresAt,
            loading = false,
            message = if (active) "Premium active" else "Free plan",
        )
    }

    fun onMessage(text: String) {
        _state.value = _state.value.copy(loading = false, message = text)
    }

    fun selectProduct(productId: String) {
        _state.value = _state.value.copy(selectedProductId = productId)
    }
}
