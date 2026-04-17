package com.app4clients.allinonebilltracker.billing

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.android.billingclient.api.ProductDetails

@Composable
fun PremiumPaywallScreen(
    premiumActive: Boolean,
    offers: List<ProductDetails>,
    onBuyClick: (ProductDetails) -> Unit,
    onRefreshEntitlement: () -> Unit,
) {
    Column(
        modifier = Modifier.padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Plan", style = MaterialTheme.typography.titleMedium)
        Text(if (premiumActive) "Premium" else "Free")

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Free")
                Text("- Item limit: ${PremiumAccessController.FREE_ITEM_LIMIT}")
                Text("- No backup/restore")
                Text("- Budget Guard locked")
            }
        }

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Premium")
                Text("- Unlimited items")
                Text("- Backup and restore")
                Text("- Budget Guard")
            }
        }

        Text("Passer a Premium", style = MaterialTheme.typography.titleMedium)

        offers.forEach { product ->
            val priceLabel = product.subscriptionOfferDetails
                ?.firstOrNull()
                ?.pricingPhases
                ?.pricingPhaseList
                ?.firstOrNull()
                ?.formattedPrice
                ?: "See price"

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { onBuyClick(product) }) {
                    Text("Buy ${product.productId} ($priceLabel)")
                }
            }
        }

        OutlinedButton(onClick = onRefreshEntitlement) {
            Text("Restore / Refresh premium")
        }
    }
}
