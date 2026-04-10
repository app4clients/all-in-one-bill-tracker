package com.allinone.billtracker.auth

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class AuthFormState(
    val fullName: String = "",
    val phoneNumber: String = "",
    val username: String = "",
    val loading: Boolean = false,
    val error: String? = null,
)

class AuthViewModel : ViewModel() {
    private val _state = MutableStateFlow(AuthFormState())
    val state: StateFlow<AuthFormState> = _state.asStateFlow()

    fun onFullNameChanged(value: String) {
        _state.value = _state.value.copy(fullName = value, error = null)
    }

    fun onPhoneChanged(value: String) {
        _state.value = _state.value.copy(phoneNumber = value, error = null)
    }

    fun onUsernameChanged(value: String) {
        _state.value = _state.value.copy(username = value, error = null)
    }

    fun setLoading(loading: Boolean) {
        _state.value = _state.value.copy(loading = loading)
    }

    fun setError(error: String?) {
        _state.value = _state.value.copy(error = error, loading = false)
    }

    fun validateSignUp(): String? {
        val s = _state.value
        if (s.fullName.trim().isEmpty()) return "Nom et prenom requis"
        if (!Regex("^\\+[1-9]\\d{7,14}$").matches(s.phoneNumber.trim())) {
            return "Numero invalide (format: +212600000000)"
        }
        if (!Regex("^[a-zA-Z0-9._-]{3,24}$").matches(s.username.trim())) {
            return "Username invalide (3-24, lettres/chiffres/._-)"
        }
        return null
    }

    fun validateLogin(): String? {
        val s = _state.value
        if (!Regex("^\\+[1-9]\\d{7,14}$").matches(s.phoneNumber.trim())) {
            return "Numero invalide (format: +212600000000)"
        }
        if (s.username.trim().isEmpty()) {
            return "Username requis"
        }
        return null
    }
}
