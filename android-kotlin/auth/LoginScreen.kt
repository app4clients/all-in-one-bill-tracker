package com.allinone.billtracker.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onSubmit: (username: String, phoneNumber: String) -> Unit,
) {
    val state by viewModel.state.collectAsState()

    Column(
        modifier = Modifier.padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Login", style = MaterialTheme.typography.titleLarge)

        OutlinedTextField(
            value = state.username,
            onValueChange = viewModel::onUsernameChanged,
            label = { Text("Username") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )

        OutlinedTextField(
            value = state.phoneNumber,
            onValueChange = viewModel::onPhoneChanged,
            label = { Text("Telephone (+212...) ") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )

        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

        Button(
            onClick = {
                val validationError = viewModel.validateLogin()
                if (validationError != null) {
                    viewModel.setError(validationError)
                    return@Button
                }
                onSubmit(state.username.trim(), state.phoneNumber.trim())
            },
            modifier = Modifier.fillMaxWidth(),
            enabled = !state.loading,
        ) {
            Text(if (state.loading) "Checking..." else "Login")
        }
    }
}
