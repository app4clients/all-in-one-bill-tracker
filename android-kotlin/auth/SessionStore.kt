package com.app4clients.allinonebilltracker.auth

import android.content.Context

class SessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("session_store", Context.MODE_PRIVATE)

    fun saveSession(token: String, user: UserDto) {
        prefs.edit()
            .putString("auth_token", token)
            .putString("app_user_id", user.appUserId)
            .putString("username", user.username)
            .putString("full_name", user.fullName)
            .apply()
    }

    fun authToken(): String? = prefs.getString("auth_token", null)

    fun appUserId(): String? = prefs.getString("app_user_id", null)

    fun username(): String? = prefs.getString("username", null)

    fun isLoggedIn(): Boolean = !authToken().isNullOrBlank()

    fun clear() {
        prefs.edit().clear().apply()
    }
}
