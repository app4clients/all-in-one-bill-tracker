package com.allinone.billtracker.auth

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

data class SignUpRequest(
    val fullName: String,
    val phoneNumber: String,
    val username: String,
    val appUserId: String? = null,
)

data class LoginRequest(
    val username: String,
    val phoneNumber: String,
)

data class UserDto(
    val appUserId: String,
    val fullName: String,
    val phoneNumber: String,
    val username: String,
)

data class AuthResponse(
    val ok: Boolean,
    val token: String,
    val user: UserDto,
)

data class MeResponse(
    val ok: Boolean,
    val user: UserDto,
)

interface AuthApiService {
    @POST("/api/auth/signup")
    suspend fun signUp(@Body body: SignUpRequest): AuthResponse

    @POST("/api/auth/login")
    suspend fun login(@Body body: LoginRequest): AuthResponse

    @GET("/api/auth/me")
    suspend fun me(): MeResponse
}
