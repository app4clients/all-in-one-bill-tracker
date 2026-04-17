import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

export async function ensureUser(userId) {
  await pool.query(
    `INSERT INTO app_users (id)
     VALUES ($1)
     ON CONFLICT (id) DO NOTHING`,
    [userId],
  );
}

function dbError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export async function registerUserProfile({
  appUserId,
  fullName,
  phoneNumber,
  username,
  usernameNormalized,
  email,
  emailNormalized,
  passwordHash,
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO app_users (id)
       VALUES ($1)
       ON CONFLICT (id) DO NOTHING`,
      [appUserId],
    );

    const existingForUser = await client.query(
      `SELECT id, username_normalized
       FROM app_users
       WHERE id = $1
       LIMIT 1`,
      [appUserId],
    );

    if (existingForUser.rows[0]?.username_normalized) {
      throw dbError("PROFILE_ALREADY_EXISTS", "Profile already exists for this user");
    }

    const existingUsername = await client.query(
      `SELECT id
       FROM app_users
       WHERE username_normalized = $1
         AND id <> $2
       LIMIT 1`,
      [usernameNormalized, appUserId],
    );

    if (existingUsername.rowCount > 0) {
      throw dbError("USERNAME_TAKEN", "Username is already used");
    }

    const existingEmail = await client.query(
      `SELECT id
       FROM app_users
       WHERE email_normalized = $1
         AND id <> $2
       LIMIT 1`,
      [emailNormalized, appUserId],
    );

    if (existingEmail.rowCount > 0) {
      throw dbError("EMAIL_TAKEN", "Email is already used");
    }

    const updated = await client.query(
       `UPDATE app_users
       SET full_name = $2,
           phone_number = $3,
           username = $4,
           username_normalized = $5,
           email = $6,
           email_normalized = $7,
           password_hash = $8,
            email_verified_at = NULL,
            email_verification_token_hash = NULL,
            email_verification_expires_at = NULL,
            failed_login_attempts = 0,
            login_locked_until = NULL,
           updated_at = NOW()
        WHERE id = $1
         RETURNING id, full_name, phone_number, username, email, email_verified_at, token_version, created_at, updated_at`,
      [appUserId, fullName, phoneNumber, username, usernameNormalized, email, emailNormalized, passwordHash],
    );

    await client.query("COMMIT");
    return updated.rows[0] ?? null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function authenticateByUsernamePassword({ usernameNormalized }) {
  const result = await pool.query(
    `SELECT id, full_name, phone_number, username, email, password_hash, email_verified_at,
            token_version, failed_login_attempts, login_locked_until, created_at, updated_at
     FROM app_users
     WHERE username_normalized = $1
     LIMIT 1`,
    [usernameNormalized],
  );

  return result.rows[0] ?? null;
}

export async function getUserById(userId) {
  const result = await pool.query(
    `SELECT id, full_name, phone_number, username, email, email_verified_at,
            token_version, failed_login_attempts, login_locked_until, created_at, updated_at
     FROM app_users
     WHERE id = $1
     LIMIT 1`,
    [userId],
  );

  return result.rows[0] ?? null;
}

export async function getUserByEmail(emailNormalized) {
  const result = await pool.query(
    `SELECT id, email, email_normalized, email_verified_at, token_version
     FROM app_users
     WHERE email_normalized = $1
     LIMIT 1`,
    [emailNormalized],
  );

  return result.rows[0] ?? null;
}

export async function createPasswordResetToken({ userId, tokenHash, expiresAt }) {
  const result = await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [userId, tokenHash, expiresAt],
  );

  return result.rows[0] ?? null;
}

export async function createPasswordResetRequestLog({ emailNormalized, ipAddress }) {
  await pool.query(
    `INSERT INTO password_reset_requests (email_normalized, ip_address)
     VALUES ($1, $2)`,
    [emailNormalized, ipAddress ?? null],
  );
}

export async function getLastPasswordResetRequest({ emailNormalized, ipAddress }) {
  const result = await pool.query(
    `SELECT created_at
     FROM password_reset_requests
     WHERE email_normalized = $1
        OR ($2::text IS NOT NULL AND ip_address = $2)
     ORDER BY created_at DESC
     LIMIT 1`,
    [emailNormalized, ipAddress ?? null],
  );

  return result.rows[0] ?? null;
}

export async function countRecentPasswordResetRequests({ emailNormalized, ipAddress, windowMinutes }) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM password_reset_requests
     WHERE created_at >= NOW() - make_interval(mins => $3::int)
       AND (
         email_normalized = $1
         OR ($2::text IS NOT NULL AND ip_address = $2)
       )`,
    [emailNormalized, ipAddress ?? null, windowMinutes],
  );

  return result.rows[0]?.count ?? 0;
}

export async function consumePasswordResetToken({ userId, tokenHash }) {
  const result = await pool.query(
    `UPDATE password_reset_tokens
     SET used_at = NOW()
     WHERE id = (
       SELECT id
       FROM password_reset_tokens
       WHERE user_id = $1
         AND token_hash = $2
         AND used_at IS NULL
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1
     )
     RETURNING id`,
    [userId, tokenHash],
  );

  return result.rowCount > 0;
}

export async function updateUserPasswordById({ userId, passwordHash }) {
  const result = await pool.query(
    `UPDATE app_users
     SET password_hash = $2,
         failed_login_attempts = 0,
         login_locked_until = NULL,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [userId, passwordHash],
  );

  return result.rowCount > 0;
}

export async function setEmailVerificationToken({ userId, tokenHash, expiresAt }) {
  const result = await pool.query(
    `UPDATE app_users
     SET email_verification_token_hash = $2,
         email_verification_expires_at = $3,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [userId, tokenHash, expiresAt],
  );

  return result.rowCount > 0;
}

export async function consumeEmailVerificationToken({ emailNormalized, tokenHash }) {
  const result = await pool.query(
    `UPDATE app_users
     SET email_verified_at = NOW(),
         email_verification_token_hash = NULL,
         email_verification_expires_at = NULL,
         updated_at = NOW()
     WHERE email_normalized = $1
       AND email_verification_token_hash = $2
       AND email_verification_expires_at IS NOT NULL
       AND email_verification_expires_at > NOW()
     RETURNING id, full_name, phone_number, username, email, email_verified_at, token_version, created_at, updated_at`,
    [emailNormalized, tokenHash],
  );

  return result.rows[0] ?? null;
}

export async function incrementFailedLoginAttempts({ userId, maxAttempts, lockMinutes }) {
  const result = await pool.query(
    `UPDATE app_users
     SET failed_login_attempts = failed_login_attempts + 1,
         login_locked_until = CASE
           WHEN failed_login_attempts + 1 >= $2 THEN NOW() + make_interval(mins => $3::int)
           ELSE login_locked_until
         END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING failed_login_attempts, login_locked_until`,
    [userId, maxAttempts, lockMinutes],
  );

  return result.rows[0] ?? null;
}

export async function clearFailedLoginAttempts({ userId }) {
  await pool.query(
    `UPDATE app_users
     SET failed_login_attempts = 0,
         login_locked_until = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [userId],
  );
}

export async function bumpUserTokenVersion({ userId }) {
  const result = await pool.query(
    `UPDATE app_users
     SET token_version = token_version + 1,
         updated_at = NOW()
     WHERE id = $1
     RETURNING token_version`,
    [userId],
  );

  return result.rows[0]?.token_version ?? null;
}

export async function deleteUserAccountById({ userId }) {
  const result = await pool.query(
    `DELETE FROM app_users
     WHERE id = $1
     RETURNING id`,
    [userId],
  );

  return result.rowCount > 0;
}

export async function saveClientErrorEvent({ userId, platform, message, stack, metadata }) {
  await pool.query(
    `INSERT INTO client_error_events (user_id, platform, message, stack, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [userId ?? null, platform ?? null, message, stack ?? null, JSON.stringify(metadata ?? {})],
  );
}

export async function saveAuthRejectionEvent({
  endpoint,
  reasonCode,
  usernameNormalized,
  emailNormalized,
  phoneNumber,
  ipAddress,
  userAgent,
  payload,
}) {
  await pool.query(
    `INSERT INTO auth_rejection_events (
      endpoint,
      reason_code,
      username_normalized,
      email_normalized,
      phone_number,
      ip_address,
      user_agent,
      payload
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      endpoint,
      reasonCode,
      usernameNormalized ?? null,
      emailNormalized ?? null,
      phoneNumber ?? null,
      ipAddress ?? null,
      userAgent ?? null,
      JSON.stringify(payload ?? {}),
    ],
  );
}

export async function listAuthRejectionEvents(limit = 50) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const result = await pool.query(
    `SELECT id, endpoint, reason_code, username_normalized, email_normalized, phone_number, ip_address, user_agent, payload, created_at
     FROM auth_rejection_events
     ORDER BY created_at DESC
     LIMIT $1`,
    [safeLimit],
  );

  return result.rows;
}

export async function saveBillingEvent({ userId, eventType, purchaseToken, payload }) {
  await pool.query(
    `INSERT INTO billing_events (user_id, provider, event_type, purchase_token, payload)
     VALUES ($1, 'google_play', $2, $3, $4::jsonb)`,
    [userId ?? null, eventType, purchaseToken ?? null, JSON.stringify(payload ?? {})],
  );
}

export async function getSubscriptionByToken(purchaseToken) {
  const result = await pool.query(
    `SELECT * FROM subscriptions WHERE purchase_token = $1 LIMIT 1`,
    [purchaseToken],
  );
  return result.rows[0] ?? null;
}

export async function getSubscriptionsByUser(userId) {
  const result = await pool.query(
    `SELECT * FROM subscriptions
     WHERE user_id = $1
     ORDER BY expires_at DESC NULLS LAST`,
    [userId],
  );
  return result.rows;
}

export async function upsertSubscription(subscription) {
  const {
    userId,
    productId,
    purchaseToken,
    basePlanId,
    offerId,
    latestOrderId,
    subscriptionState,
    isAutoRenewing,
    isRefunded,
    acknowledged,
    startedAt,
    expiresAt,
    rawPayload,
  } = subscription;

  await pool.query(
    `INSERT INTO subscriptions (
      user_id,
      provider,
      product_id,
      purchase_token,
      base_plan_id,
      offer_id,
      latest_order_id,
      subscription_state,
      is_auto_renewing,
      is_refunded,
      acknowledged,
      started_at,
      expires_at,
      raw_payload,
      updated_at
    ) VALUES (
      $1,
      'google_play',
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      $11,
      $12,
      $13::jsonb,
      NOW()
    )
    ON CONFLICT (purchase_token)
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      product_id = EXCLUDED.product_id,
      base_plan_id = EXCLUDED.base_plan_id,
      offer_id = EXCLUDED.offer_id,
      latest_order_id = EXCLUDED.latest_order_id,
      subscription_state = EXCLUDED.subscription_state,
      is_auto_renewing = EXCLUDED.is_auto_renewing,
      is_refunded = EXCLUDED.is_refunded,
      acknowledged = EXCLUDED.acknowledged,
      started_at = EXCLUDED.started_at,
      expires_at = EXCLUDED.expires_at,
      raw_payload = EXCLUDED.raw_payload,
      updated_at = NOW()`,
    [
      userId,
      productId,
      purchaseToken,
      basePlanId,
      offerId,
      latestOrderId,
      subscriptionState,
      isAutoRenewing,
      isRefunded,
      acknowledged,
      startedAt,
      expiresAt,
      JSON.stringify(rawPayload ?? {}),
    ],
  );
}

export async function getActiveEntitlement(userId) {
  const result = await pool.query(
    `SELECT * FROM subscriptions
     WHERE user_id = $1
       AND is_refunded = FALSE
       AND subscription_state IN ('SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD')
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY expires_at DESC NULLS LAST
     LIMIT 1`,
    [userId],
  );

  return result.rows[0] ?? null;
}