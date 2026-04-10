package com.allinone.billtracker.auth

class AuthRepository(
    private val api: AuthApiService,
    private val sessionStore: SessionStore,
) {
    suspend fun signUp(fullName: String, phoneNumber: String, username: String, appUserId: String?) {
        val response = api.signUp(
            SignUpRequest(
                fullName = fullName,
                phoneNumber = phoneNumber,
                username = username,
                appUserId = appUserId,
            )
        )
        sessionStore.saveSession(response.token, response.user)
    }

    suspend fun login(username: String, phoneNumber: String) {
        val response = api.login(
            LoginRequest(
                username = username,
                phoneNumber = phoneNumber,
            )
        )
        sessionStore.saveSession(response.token, response.user)
    }

    fun logout() {
        sessionStore.clear()
    }
}
