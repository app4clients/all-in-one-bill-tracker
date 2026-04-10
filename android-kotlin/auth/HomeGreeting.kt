package com.allinone.billtracker.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun HomeGreeting(
    username: String?,
    onLogout: () -> Unit,
) {
    val safeName = username?.takeIf { it.isNotBlank() } ?: "User"

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.Start,
    ) {
        Text(
            text = "Bonjour $safeName",
            style = MaterialTheme.typography.titleMedium,
        )

        OutlinedButton(onClick = onLogout) {
            Text("Log out")
        }
    }
}
