# Google Play Billing Production Guide (Free vs Premium)

This implementation uses Google Play Billing only for Android premium subscriptions.

## 1) Product model

1. Free plan
- Limited item creation (`10` items)
- Backup/Restore locked
- Budget Guard locked

2. Premium plan
- Unlimited item creation
- Backup enabled
- Restore enabled
- Budget Guard enabled

### Recommended starter pricing

1. Monthly: `19 MAD`
2. Yearly: `149 MAD` (about 35% less than paying monthly all year)

Use these as your first production prices, then adjust after 2-4 weeks from conversion/churn data.

## 2) Play Console setup

1. Open Play Console -> Monetize -> Subscriptions.
2. Create products:
- `premium_monthly`
- `premium_yearly`
3. Add active base plans for each product.
4. Publish to Internal testing first.

## 3) Android implementation files

Use `android-kotlin/`:

1. `BillingProducts.kt`
- Product IDs used by BillingClient.

2. `GooglePlayBillingManager.kt`
- Billing connection
- Offer query
- Purchase flow
- purchaseToken extraction
- Backend verification
- Acknowledge purchase

3. `PremiumApiService.kt`
- Retrofit contract for backend endpoints.

4. `PremiumAccessController.kt`
- Free vs premium gates (item limit, backup, restore, budget guard).

5. `PremiumViewModel.kt`
- Premium state holder for UI.

6. `PremiumPaywallScreen.kt`
- Example Compose paywall screen showing free/premium features and offers.

### Android dependencies

```gradle
implementation("com.android.billingclient:billing-ktx:7.1.1")
implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
implementation("com.squareup.retrofit2:retrofit:2.11.0")
implementation("com.squareup.retrofit2:converter-gson:2.11.0")
```

## 4) Backend verification

Implemented in `server/`:

1. `POST /api/billing/google-play/verify`
- Input: `{ appUserId, productId, purchaseToken }`
- Verifies token with Google Play Developer API
- Checks product validity, state, expiry and refunded state
- Stores subscription in DB
- Returns `premiumActive`

2. `GET /api/billing/entitlement/:appUserId`
- Called on every app open
- Revalidates stored tokens with Google
- Returns current premium entitlement

3. `POST /api/billing/google-play/rtdn`
- Optional but recommended
- Receives Real-time Developer Notification from Pub/Sub push
- Triggers fresh sync for token lifecycle updates (renew/cancel/refund/expire)

## 5) Database structure

See `server/schema.sql`.

Main tables:

1. `app_users`
2. `subscriptions`
3. `billing_events`

Critical fields:

1. `purchase_token UNIQUE`
2. `subscription_state`
3. `expires_at`
4. `is_refunded`
5. `raw_payload` for audit/debug

## 6) Required security rules

1. Never activate premium from client-only state.
2. Verify every purchase token server-side.
3. Prevent replay: same token cannot be attached to another user.
4. Re-check entitlement on every app open.
5. Keep service-account key on backend only.
6. Use HTTPS in production.
7. Log billing events for dispute/fraud investigations.

## 7) Purchase outcomes

1. Success
- Billing callback returns purchase
- App sends token to backend
- Backend validates and returns `premiumActive=true`

2. User canceled
- Billing response: `USER_CANCELED`
- Keep free plan

3. Payment error
- Billing response not OK
- Keep free plan and show error

4. Refund
- Backend marks refunded via refresh/RTDN
- Premium revoked

5. Expiration
- Backend checks `expires_at` and state
- Premium revoked on expiration

## 8) UX best practices for free vs premium

1. Show clear free limitations inline (item limit counter).
2. Keep premium section visible but concise: "Passer a Premium".
3. Show exactly what unlocks: unlimited items, backup/restore, budget guard.
4. Keep a restore button in paywall.
5. Explain that premium is validated securely on server.

## 9) Backend startup

```bash
cp server/.env.example server/.env
# fill real values

psql "$DATABASE_URL" -f server/schema.sql

node server/index.js
```
