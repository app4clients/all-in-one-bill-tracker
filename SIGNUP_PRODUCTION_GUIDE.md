# Android Sign Up + Secure Backend (Production Notes)

## 1) Required user fields on first sign up
- fullName
- phoneNumber (E.164, example: +212600000000)
- username (3-24 chars, letters/numbers/._-)

## 2) Backend endpoints
- POST `/api/auth/signup`
- POST `/api/auth/login`
- GET `/api/auth/me` (Bearer token)

## 3) Security model
- Premium is never activated only from app state.
- Purchase tokens are verified on backend (Google Play API).
- Entitlement is refreshed from backend on each app open.
- Username uniqueness is enforced in DB with a unique index.

## 4) DB updates
`app_users` now stores profile fields:
- `full_name`
- `phone_number`
- `username`
- `username_normalized` (unique)

Apply SQL from `server/schema.sql` to migrate existing databases.

## 5) Android integration flow
1. Show `SignUpScreen` on first launch.
2. Call backend sign up, save JWT + appUserId in `SessionStore`.
3. Show `LoginScreen` for returning users.
4. Fetch `/api/auth/me` and display `HomeGreeting("Bonjour [username]")`.
5. Use stored `appUserId` for billing verification requests.
6. Add a `Log out` action that clears `SessionStore` and routes back to `LoginScreen`.

## 6) Extra hardening recommended
- Add OTP verification on phone number.
- Add rate limiting per IP and username.
- Add device binding and refresh-token rotation.
- Add encrypted local storage for auth token.
