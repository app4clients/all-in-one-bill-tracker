import licenseRoutes from "./routes/license.routes.js";
import { writeFileSync } from "fs";
import "dotenv/config";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import { createHash, randomBytes, randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { Resend } from "resend";
import { z } from "zod";
import {
  authenticateByUsernamePassword,
  bumpUserTokenVersion,
  clearFailedLoginAttempts,
  consumeEmailVerificationToken,
  countRecentPasswordResetRequests,
  consumePasswordResetToken,
  createPasswordResetToken,
  createPasswordResetRequestLog,
  deleteUserAccountById,
  ensureUser,
  getActiveEntitlement,
  getLastPasswordResetRequest,
  getUserByEmail,
  incrementFailedLoginAttempts,
  listAuthRejectionEvents,
  getSubscriptionByToken,
  getSubscriptionsByUser,
  getUserById,
  registerUserProfile,
  saveClientErrorEvent,
  saveAuthRejectionEvent,
  saveBillingEvent,
  setEmailVerificationToken,
  updateUserPasswordById,
  upsertSubscription,
  upsertWebhookSubscription,
  getActiveWebhookSubscription,
} from "./db.js";
import { verifySubscriptionToken } from "./googlePlay.js";
import { createHmac } from "crypto";

const app = express();
const GOOGLE_KEY_TMP_PATH = "/tmp/gp-key.json";

try {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH && process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON) {
    writeFileSync(GOOGLE_KEY_TMP_PATH, process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON, { encoding: "utf8" });
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH = GOOGLE_KEY_TMP_PATH;
    console.log("Google service account key loaded from env JSON");
  }
} catch (error) {
  console.error("Failed to prepare Google service account key file:", error);
}
app.use(cors());

app.use(express.json({ limit: "1mb" }));

const PRODUCT_IDS = [
  process.env.GP_PRODUCT_MONTHLY,
  process.env.GP_PRODUCT_YEARLY,
].filter(Boolean);

const verifyBodySchema = z.object({
  appUserId: z.string().min(3),
  purchaseToken: z.string().min(10),
  productId: z.string().min(3),
});

const signupSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  phoneNumber: z.string().trim().min(8).max(20),
  username: z.string().trim().min(3).max(24),
  email: z.string().trim().email().max(150),
  password: z.string().min(8).max(72),
  appUserId: z.string().trim().min(3).max(128).optional(),
});

const loginSchema = z.object({
  username: z.string().trim().min(3).max(24),
  password: z.string().min(8).max(72),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(150),
});

const resetPasswordSchema = z
  .object({
    email: z.string().trim().email().max(150),
    resetToken: z.string().trim().min(8).max(128).optional(),
    resetCode: z.string().trim().min(8).max(128).optional(),
    newPassword: z.string().min(8).max(72),
  })
  .refine((value) => Boolean(value.resetToken || value.resetCode), {
    message: "resetToken or resetCode is required",
    path: ["resetToken"],
  })
  .transform((value) => ({
    email: value.email,
    // Support both keys so mobile/web clients can send either name.
    resetToken: value.resetToken ?? value.resetCode,
    newPassword: value.newPassword,
  }));

const verifyEmailSchema = z.object({
  email: z.string().trim().email().max(150),
  verificationCode: z.string().trim().min(8).max(128),
});

const clientErrorSchema = z.object({
  platform: z.string().trim().min(2).max(64),
  message: z.string().trim().min(2).max(500),
  stack: z.string().trim().max(4000).optional(),
  metadata: z.record(z.any()).optional(),
});

const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,24}$/;
const PHONE_REGEX = /^\+[1-9]\d{7,14}$/;
const DEFAULT_BLOCKED_USERNAME_WORDS = ["sex", "porn", "xxx", "nude", "adult", "escort", "camgirl", "onlyfans"];
const PASSWORD_RESET_TTL_MINUTES = Number(process.env.AUTH_PASSWORD_RESET_TTL_MINUTES ?? 15);
const EXPOSE_RESET_TOKEN = process.env.AUTH_EXPOSE_RESET_TOKEN === "true";
const EMAIL_VERIFICATION_TTL_HOURS = Number(process.env.AUTH_EMAIL_VERIFICATION_TTL_HOURS ?? 24);
const EXPOSE_EMAIL_VERIFICATION_CODE = process.env.AUTH_EXPOSE_EMAIL_VERIFICATION_CODE === "true";
const RESET_RESEND_COOLDOWN_SECONDS = Number(process.env.AUTH_RESET_RESEND_COOLDOWN_SECONDS ?? 60);
const RESET_RATE_LIMIT_WINDOW_MINUTES = Number(process.env.AUTH_RESET_RATE_LIMIT_WINDOW_MINUTES ?? 15);
const RESET_RATE_LIMIT_MAX_REQUESTS = Number(process.env.AUTH_RESET_RATE_LIMIT_MAX_REQUESTS ?? 5);
const LOGIN_MAX_FAILED_ATTEMPTS = Number(process.env.AUTH_LOGIN_MAX_FAILED_ATTEMPTS ?? 5);
const LOGIN_LOCK_MINUTES = Number(process.env.AUTH_LOGIN_LOCK_MINUTES ?? 15);
const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim();
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL?.trim();
const APP_DISPLAY_NAME = process.env.APP_DISPLAY_NAME?.trim() || "All-in-One Bill Tracker";
const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID ?? "";
const GUMROAD_WEBHOOK_SECRET = process.env.GUMROAD_WEBHOOK_SECRET ?? "";
const resendClient = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

function parseBlockedWords(raw) {
  if (!raw) {
    return DEFAULT_BLOCKED_USERNAME_WORDS;
  }

  const words = raw
    .split(",")
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean)
    .map((word) => word.replace(/[^a-z0-9]/g, ""))
    .filter((word) => word.length >= 2);

  return words.length > 0 ? [...new Set(words)] : DEFAULT_BLOCKED_USERNAME_WORDS;
}

const BLOCKED_USERNAME_WORDS = parseBlockedWords(process.env.BLOCKED_USERNAME_WORDS);
const ALLOWED_USERNAME_WHITELIST = new Set(
  (process.env.ALLOWED_USERNAME_WHITELIST ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean),
);

function extractClientIp(req) {
  const forwarded = req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.ip || "";
}

async function logAuthRejection(req, {
  reasonCode,
  username,
  email,
  phoneNumber,
  payload,
}) {
  try {
    await saveAuthRejectionEvent({
      endpoint: req.path,
      reasonCode,
      usernameNormalized: username ? normalizeUsername(username) : null,
      emailNormalized: email ? normalizeEmail(email) : null,
      phoneNumber: phoneNumber ?? null,
      ipAddress: extractClientIp(req),
      userAgent: req.header("user-agent") ?? "",
      payload,
    });
  } catch {
    // Ignore logging failures to avoid blocking auth flows.
  }
}

function isUsernameWhitelisted(username) {
  return ALLOWED_USERNAME_WHITELIST.has(normalizeUsername(username));
}

function normalizeUsername(username) {
  return username.trim().toLowerCase();
}

function normalizePhoneNumber(phoneNumber) {
  const compact = phoneNumber.replace(/[\s().-]/g, "");
  if (compact.startsWith("00")) {
    return `+${compact.slice(2)}`;
  }
  return compact;
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function hashResetToken(resetToken) {
  return createHash("sha256").update(resetToken).digest("hex");
}

async function sendPasswordResetEmail({ toEmail, resetToken, expiresInMinutes }) {
  // Skip delivery when provider is not configured; test mode can still expose token via API.
  if (!resendClient || !RESEND_FROM_EMAIL) {
    return false;
  }

  const subject = `${APP_DISPLAY_NAME} password reset code`;
  const text = [
    `You requested a password reset for ${APP_DISPLAY_NAME}.`,
    "",
    `Reset code: ${resetToken}`,
    `This code expires in ${expiresInMinutes} minutes.`,
    "",
    "If you did not request this, you can ignore this email.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
      <h2 style="margin:0 0 12px">${APP_DISPLAY_NAME}</h2>
      <p style="margin:0 0 10px">You requested a password reset.</p>
      <p style="margin:0 0 10px">Use this code:</p>
      <p style="font-size:22px;font-weight:700;letter-spacing:1px;margin:0 0 10px">${resetToken}</p>
      <p style="margin:0 0 10px">This code expires in <strong>${expiresInMinutes} minutes</strong>.</p>
      <p style="margin:0">If this was not you, ignore this email.</p>
    </div>
  `;

  await resendClient.emails.send({
    from: RESEND_FROM_EMAIL,
    to: toEmail,
    subject,
    text,
    html,
  });

  return true;
}

async function sendEmailVerificationCode({ toEmail, verificationCode, expiresInHours }) {
  if (!resendClient || !RESEND_FROM_EMAIL) {
    return false;
  }

  const subject = `${APP_DISPLAY_NAME} email verification code`;
  const text = [
    `Welcome to ${APP_DISPLAY_NAME}.`,
    "",
    `Verification code: ${verificationCode}`,
    `This code expires in ${expiresInHours} hours.`,
    "",
    "If you did not create this account, you can ignore this email.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
      <h2 style="margin:0 0 12px">${APP_DISPLAY_NAME}</h2>
      <p style="margin:0 0 10px">Confirm your email to secure your account.</p>
      <p style="margin:0 0 10px">Verification code:</p>
      <p style="font-size:22px;font-weight:700;letter-spacing:1px;margin:0 0 10px">${verificationCode}</p>
      <p style="margin:0 0 10px">Code expires in <strong>${expiresInHours} hours</strong>.</p>
      <p style="margin:0">If this wasn't you, ignore this email.</p>
    </div>
  `;

  await resendClient.emails.send({
    from: RESEND_FROM_EMAIL,
    to: toEmail,
    subject,
    text,
    html,
  });

  return true;
}

function normalizeForModeration(value) {
  return value
    .toLowerCase()
    .replace(/[0]/g, "o")
    .replace(/[1]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4]/g, "a")
    .replace(/[5]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[^a-z]/g, "");
}

function containsBlockedUsernameWord(username) {
  if (isUsernameWhitelisted(username)) {
    return false;
  }
  const normalized = normalizeForModeration(username);
  return BLOCKED_USERNAME_WORDS.some((word) => normalized.includes(word));
}

function signAuthToken(payload) {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new Error("AUTH_JWT_SECRET is required");
  }

  return jwt.sign(payload, secret, {
    algorithm: "HS256",
    expiresIn: process.env.AUTH_JWT_EXPIRES_IN ?? "30d",
  });
}

async function authMiddleware(req, res, next) {
  const auth = req.header("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, code: "UNAUTHORIZED" });
  }

  const token = auth.slice("Bearer ".length).trim();
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) {
    return res.status(500).json({ ok: false, code: "SERVER_MISCONFIGURED" });
  }

  try {
    const payload = jwt.verify(token, secret);
    const user = await getUserById(payload?.appUserId);
    if (!user) {
      return res.status(401).json({ ok: false, code: "INVALID_TOKEN" });
    }

    if ((payload?.tokenVersion ?? 0) !== (user.token_version ?? 0)) {
      return res.status(401).json({ ok: false, code: "TOKEN_REVOKED" });
    }

    req.auth = payload;
    return next();
  } catch {
    return res.status(401).json({ ok: false, code: "INVALID_TOKEN" });
  }
}

function decodeRtdnMessage(messageData) {
  try {
    const raw = Buffer.from(String(messageData ?? ""), "base64").toString("utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function syncOnePurchase({ appUserId, purchaseToken }) {
  const packageName = process.env.GP_PACKAGE_NAME;
  if (!packageName) {
    throw new Error("GP_PACKAGE_NAME is required");
  }

  const verified = await verifySubscriptionToken({
    packageName,
    purchaseToken,
    expectedProductIds: PRODUCT_IDS,
  });

  await ensureUser(appUserId);
  await upsertSubscription({
    userId: appUserId,
    productId: verified.productId,
    purchaseToken: verified.purchaseToken,
    basePlanId: verified.basePlanId,
    offerId: verified.offerId,
    latestOrderId: verified.latestOrderId,
    subscriptionState: verified.subscriptionState,
    isAutoRenewing: verified.isAutoRenewing,
    isRefunded: verified.isRefunded,
    acknowledged: verified.acknowledged,
    startedAt: verified.startTime,
    expiresAt: verified.expiryTime,
    rawPayload: verified.rawPayload,
  });

  await saveBillingEvent({
    userId: appUserId,
    eventType: "verify_purchase",
    purchaseToken,
    payload: verified,
  });

  return verified;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "google-play-billing-backend" });
});

app.get("/api/auth/username-policy", (_req, res) => {
  return res.json({
    ok: true,
    usernameRegex: USERNAME_REGEX.source,
    blockedWords: BLOCKED_USERNAME_WORDS,
    allowedUsernames: Array.from(ALLOWED_USERNAME_WHITELIST),
  });
});

app.get("/api/auth/rejections", async (req, res) => {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey || req.header("x-admin-key") !== adminKey) {
    return res.status(401).json({ ok: false, code: "UNAUTHORIZED" });
  }

  const limit = Number(req.query.limit ?? 50);
  const events = await listAuthRejectionEvents(limit);
  return res.json({ ok: true, events });
});

app.post("/api/auth/signup", async (req, res) => {
  try {
    const parsed = signupSchema.parse(req.body);

    const usernameNormalized = normalizeUsername(parsed.username);
    if (!USERNAME_REGEX.test(usernameNormalized)) {
      await logAuthRejection(req, {
        reasonCode: "INVALID_USERNAME",
        username: parsed.username,
        email: parsed.email,
        phoneNumber: parsed.phoneNumber,
      });
      return res.status(400).json({
        ok: false,
        code: "INVALID_USERNAME",
        message: "Username must be 3-24 chars and use letters, numbers, dot, dash, underscore",
      });
    }

    if (containsBlockedUsernameWord(parsed.username)) {
      await logAuthRejection(req, {
        reasonCode: "BLOCKED_USERNAME",
        username: parsed.username,
        email: parsed.email,
        phoneNumber: parsed.phoneNumber,
      });
      return res.status(400).json({
        ok: false,
        code: "BLOCKED_USERNAME",
        message: "Username contains blocked words",
      });
    }

    const normalizedPhone = normalizePhoneNumber(parsed.phoneNumber);
    if (!PHONE_REGEX.test(normalizedPhone)) {
      await logAuthRejection(req, {
        reasonCode: "INVALID_PHONE",
        username: parsed.username,
        email: parsed.email,
        phoneNumber: parsed.phoneNumber,
      });
      return res.status(400).json({
        ok: false,
        code: "INVALID_PHONE",
        message: "Phone number must be in E.164 format, example +212600000000",
      });
    }

    const emailNormalized = normalizeEmail(parsed.email);
    const emailValidation = z.string().email().safeParse(emailNormalized);
    if (!emailValidation.success) {
      await logAuthRejection(req, {
        reasonCode: "INVALID_EMAIL",
        username: parsed.username,
        email: parsed.email,
        phoneNumber: parsed.phoneNumber,
      });
      return res.status(400).json({
        ok: false,
        code: "INVALID_EMAIL",
        message: "Email is invalid",
      });
    }

    const passwordHash = await bcrypt.hash(parsed.password, 12);

    const appUserId = parsed.appUserId ?? randomUUID();
    const user = await registerUserProfile({
      appUserId,
      fullName: parsed.fullName.trim(),
      phoneNumber: normalizedPhone,
      username: parsed.username.trim(),
      usernameNormalized,
      email: parsed.email.trim(),
      emailNormalized,
      passwordHash,
    });

    const verificationCode = randomBytes(24).toString("hex");
    const verificationCodeHash = hashResetToken(verificationCode);
    const verificationExpiresAt = new Date(Date.now() + Math.max(1, EMAIL_VERIFICATION_TTL_HOURS) * 60 * 60 * 1000);
    await setEmailVerificationToken({
      userId: user.id,
      tokenHash: verificationCodeHash,
      expiresAt: verificationExpiresAt,
    });

    try {
      await sendEmailVerificationCode({
        toEmail: user.email,
        verificationCode,
        expiresInHours: Math.max(1, EMAIL_VERIFICATION_TTL_HOURS),
      });
    } catch (emailError) {
      await logAuthRejection(req, {
        reasonCode: "EMAIL_VERIFICATION_DELIVERY_FAILED",
        email: user.email,
        payload: { message: emailError instanceof Error ? emailError.message : "Email provider error" },
      });
    }

    return res.status(201).json({
      ok: true,
      requiresEmailVerification: true,
      expiresInHours: Math.max(1, EMAIL_VERIFICATION_TTL_HOURS),
      ...(EXPOSE_EMAIL_VERIFICATION_CODE ? { verificationCode } : {}),
      user: {
        appUserId: user.id,
        fullName: user.full_name,
        phoneNumber: user.phone_number,
        username: user.username,
        email: user.email,
        emailVerifiedAt: user.email_verified_at ?? null,
      },
    });
  } catch (error) {
    if (error?.code === "USERNAME_TAKEN") {
      await logAuthRejection(req, { reasonCode: "USERNAME_TAKEN", payload: { source: "db" } });
      return res.status(409).json({ ok: false, code: "USERNAME_TAKEN" });
    }

    if (error?.code === "PROFILE_ALREADY_EXISTS") {
      await logAuthRejection(req, { reasonCode: "PROFILE_ALREADY_EXISTS", payload: { source: "db" } });
      return res.status(409).json({ ok: false, code: "PROFILE_ALREADY_EXISTS" });
    }

    if (error?.code === "EMAIL_TAKEN") {
      await logAuthRejection(req, { reasonCode: "EMAIL_TAKEN", payload: { source: "db" } });
      return res.status(409).json({ ok: false, code: "EMAIL_TAKEN" });
    }

    if (error instanceof z.ZodError) {
      await logAuthRejection(req, {
        reasonCode: "SIGNUP_VALIDATION_FAILED",
        payload: { issues: error.issues.map((issue) => issue.path.join(".") || issue.code) },
      });
    } else {
      await logAuthRejection(req, {
        reasonCode: "SIGNUP_FAILED",
        payload: { message: error instanceof Error ? error.message : "Unknown error" },
      });
    }

    return res.status(400).json({
      ok: false,
      code: "SIGNUP_FAILED",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const parsed = loginSchema.parse(req.body);

    const usernameNormalized = normalizeUsername(parsed.username);
    const user = await authenticateByUsernamePassword({
      usernameNormalized,
    });

    if (!user?.password_hash) {
      await logAuthRejection(req, {
        reasonCode: "INVALID_CREDENTIALS",
        username: parsed.username,
      });
      return res.status(401).json({ ok: false, code: "INVALID_CREDENTIALS" });
    }

    if (user.login_locked_until && new Date(user.login_locked_until).getTime() > Date.now()) {
      const retryAfterSeconds = Math.max(1, Math.ceil((new Date(user.login_locked_until).getTime() - Date.now()) / 1000));
      await logAuthRejection(req, {
        reasonCode: "LOGIN_LOCKED",
        username: parsed.username,
        payload: { retryAfterSeconds },
      });
      return res.status(429).json({
        ok: false,
        code: "LOGIN_LOCKED",
        retryAfterSeconds,
        message: "Too many failed attempts. Please wait before retrying.",
      });
    }

    const passwordMatches = await bcrypt.compare(parsed.password, user.password_hash);
    if (!passwordMatches) {
      const lockState = await incrementFailedLoginAttempts({
        userId: user.id,
        maxAttempts: Math.max(3, LOGIN_MAX_FAILED_ATTEMPTS),
        lockMinutes: Math.max(1, LOGIN_LOCK_MINUTES),
      });
      await logAuthRejection(req, {
        reasonCode: "INVALID_CREDENTIALS",
        username: parsed.username,
      });
      const isLocked = Boolean(lockState?.login_locked_until && new Date(lockState.login_locked_until).getTime() > Date.now());
      return res.status(isLocked ? 429 : 401).json({
        ok: false,
        code: isLocked ? "LOGIN_LOCKED" : "INVALID_CREDENTIALS",
        message: isLocked ? "Too many failed attempts. Please wait before retrying." : "Invalid credentials",
      });
    }

    await clearFailedLoginAttempts({ userId: user.id });

    if (!user.email_verified_at) {
      await logAuthRejection(req, {
        reasonCode: "LOGIN_EMAIL_NOT_VERIFIED",
        username: parsed.username,
        email: user.email,
      });
      return res.status(403).json({
        ok: false,
        code: "EMAIL_NOT_VERIFIED",
        message: "Please verify your email before logging in.",
        requiresEmailVerification: true,
        verificationEmail: user.email,
      });
    }

    const token = signAuthToken({
      appUserId: user.id,
      username: user.username,
      tokenVersion: user.token_version ?? 0,
    });

    return res.json({
      ok: true,
      token,
      user: {
        appUserId: user.id,
        fullName: user.full_name,
        phoneNumber: user.phone_number,
        username: user.username,
        email: user.email,
        emailVerifiedAt: user.email_verified_at,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      await logAuthRejection(req, {
        reasonCode: "LOGIN_VALIDATION_FAILED",
        payload: { issues: error.issues.map((issue) => issue.path.join(".") || issue.code) },
      });
    } else {
      await logAuthRejection(req, {
        reasonCode: "LOGIN_FAILED",
        payload: { message: error instanceof Error ? error.message : "Unknown error" },
      });
    }
    return res.status(400).json({
      ok: false,
      code: "LOGIN_FAILED",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/api/auth/verify-email", async (req, res) => {
  try {
    const parsed = verifyEmailSchema.parse(req.body);
    const emailNormalized = normalizeEmail(parsed.email);
    const tokenHash = hashResetToken(parsed.verificationCode);
    const verifiedUser = await consumeEmailVerificationToken({
      emailNormalized,
      tokenHash,
    });

    if (!verifiedUser) {
      await logAuthRejection(req, {
        reasonCode: "EMAIL_VERIFICATION_INVALID_CODE",
        email: parsed.email,
      });
      return res.status(400).json({
        ok: false,
        code: "INVALID_VERIFICATION_CODE",
        message: "Verification code is invalid or expired.",
      });
    }

    const token = signAuthToken({
      appUserId: verifiedUser.id,
      username: verifiedUser.username,
      tokenVersion: verifiedUser.token_version ?? 0,
    });

    return res.status(200).json({
      ok: true,
      token,
      user: {
        appUserId: verifiedUser.id,
        fullName: verifiedUser.full_name,
        phoneNumber: verifiedUser.phone_number,
        username: verifiedUser.username,
        email: verifiedUser.email,
        emailVerifiedAt: verifiedUser.email_verified_at,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      await logAuthRejection(req, {
        reasonCode: "EMAIL_VERIFICATION_VALIDATION_FAILED",
        payload: { issues: error.issues.map((issue) => issue.path.join(".") || issue.code) },
      });
    }
    return res.status(400).json({
      ok: false,
      code: "EMAIL_VERIFICATION_FAILED",
      message: "Unable to verify email.",
    });
  }
});

app.post("/api/auth/resend-verification", async (req, res) => {
  try {
    const parsed = forgotPasswordSchema.parse(req.body);
    const emailNormalized = normalizeEmail(parsed.email);
    const user = await getUserByEmail(emailNormalized);

    if (!user?.id || user.email_verified_at) {
      return res.status(200).json({
        ok: true,
        message: "If the account exists, verification instructions were sent.",
      });
    }

    const verificationCode = randomBytes(24).toString("hex");
    const verificationCodeHash = hashResetToken(verificationCode);
    const verificationExpiresAt = new Date(Date.now() + Math.max(1, EMAIL_VERIFICATION_TTL_HOURS) * 60 * 60 * 1000);
    await setEmailVerificationToken({
      userId: user.id,
      tokenHash: verificationCodeHash,
      expiresAt: verificationExpiresAt,
    });

    try {
      await sendEmailVerificationCode({
        toEmail: user.email,
        verificationCode,
        expiresInHours: Math.max(1, EMAIL_VERIFICATION_TTL_HOURS),
      });
    } catch (emailError) {
      await logAuthRejection(req, {
        reasonCode: "EMAIL_VERIFICATION_DELIVERY_FAILED",
        email: user.email,
        payload: { message: emailError instanceof Error ? emailError.message : "Email provider error" },
      });
    }

    return res.status(200).json({
      ok: true,
      message: "If the account exists, verification instructions were sent.",
      ...(EXPOSE_EMAIL_VERIFICATION_CODE ? { verificationCode } : {}),
    });
  } catch {
    return res.status(400).json({
      ok: false,
      code: "RESEND_VERIFICATION_FAILED",
      message: "Unable to resend verification email.",
    });
  }
});

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const parsed = forgotPasswordSchema.parse(req.body);
    const emailNormalized = normalizeEmail(parsed.email);
    const ipAddress = extractClientIp(req);

    const lastRequest = await getLastPasswordResetRequest({
      emailNormalized,
      ipAddress,
    });

    const cooldownSeconds = Math.max(15, RESET_RESEND_COOLDOWN_SECONDS);
    if (lastRequest?.created_at) {
      const elapsedSeconds = Math.floor((Date.now() - new Date(lastRequest.created_at).getTime()) / 1000);
      const retryAfterSeconds = cooldownSeconds - elapsedSeconds;

      if (retryAfterSeconds > 0) {
        await logAuthRejection(req, {
          reasonCode: "FORGOT_PASSWORD_COOLDOWN_ACTIVE",
          email: parsed.email,
          payload: { retryAfterSeconds },
        });

        return res.status(429).json({
          ok: false,
          code: "RESET_COOLDOWN_ACTIVE",
          message: `Please wait ${retryAfterSeconds}s before requesting another code.`,
          retryAfterSeconds,
        });
      }
    }

    const recentRequestCount = await countRecentPasswordResetRequests({
      emailNormalized,
      ipAddress,
      windowMinutes: Math.max(5, RESET_RATE_LIMIT_WINDOW_MINUTES),
    });

    if (recentRequestCount >= Math.max(2, RESET_RATE_LIMIT_MAX_REQUESTS)) {
      const retryAfterSeconds = Math.max(60, RESET_RATE_LIMIT_WINDOW_MINUTES * 60);

      await logAuthRejection(req, {
        reasonCode: "FORGOT_PASSWORD_RATE_LIMITED",
        email: parsed.email,
        payload: { recentRequestCount, windowMinutes: RESET_RATE_LIMIT_WINDOW_MINUTES },
      });

      return res.status(429).json({
        ok: false,
        code: "RESET_RATE_LIMITED",
        message: "Too many reset requests. Please try again later.",
        retryAfterSeconds,
      });
    }

    await createPasswordResetRequestLog({
      emailNormalized,
      ipAddress,
    });

    const user = await getUserByEmail(emailNormalized);

    if (!user?.id) {
      await logAuthRejection(req, {
        reasonCode: "FORGOT_PASSWORD_UNKNOWN_EMAIL",
        email: parsed.email,
      });
      return res.status(200).json({
        ok: true,
        message: "If the email exists, reset instructions were generated.",
      });
    }

    const resetToken = randomBytes(24).toString("hex");
    const tokenHash = hashResetToken(resetToken);
    const expiresAt = new Date(Date.now() + Math.max(5, PASSWORD_RESET_TTL_MINUTES) * 60 * 1000);

    await createPasswordResetToken({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    try {
      await sendPasswordResetEmail({
        toEmail: user.email,
        resetToken,
        expiresInMinutes: Math.max(5, PASSWORD_RESET_TTL_MINUTES),
      });
    } catch (emailError) {
      await logAuthRejection(req, {
        reasonCode: "FORGOT_PASSWORD_EMAIL_DELIVERY_FAILED",
        email: parsed.email,
        payload: { message: emailError instanceof Error ? emailError.message : "Email provider error" },
      });
    }

    const responsePayload = {
      ok: true,
      message: "If the email exists, reset instructions were generated.",
      expiresInMinutes: Math.max(5, PASSWORD_RESET_TTL_MINUTES),
      ...(EXPOSE_RESET_TOKEN ? { resetToken, resetCode: resetToken } : {}),
    };

    return res.status(200).json(responsePayload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      await logAuthRejection(req, {
        reasonCode: "FORGOT_PASSWORD_VALIDATION_FAILED",
        payload: { issues: error.issues.map((issue) => issue.path.join(".") || issue.code) },
      });
    }
    return res.status(400).json({
      ok: false,
      code: "FORGOT_PASSWORD_FAILED",
      message: "Unable to process forgot password request.",
    });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const parsed = resetPasswordSchema.parse(req.body);
    const emailNormalized = normalizeEmail(parsed.email);
    const user = await getUserByEmail(emailNormalized);
    if (!user?.id) {
      await logAuthRejection(req, {
        reasonCode: "RESET_PASSWORD_UNKNOWN_EMAIL",
        email: parsed.email,
      });
      return res.status(400).json({ ok: false, code: "INVALID_RESET_TOKEN" });
    }

    const tokenHash = hashResetToken(parsed.resetToken);
    const tokenWasConsumed = await consumePasswordResetToken({
      userId: user.id,
      tokenHash,
    });

    if (!tokenWasConsumed) {
      await logAuthRejection(req, {
        reasonCode: "RESET_PASSWORD_INVALID_TOKEN",
        email: parsed.email,
      });
      return res.status(400).json({ ok: false, code: "INVALID_RESET_TOKEN" });
    }

    const passwordHash = await bcrypt.hash(parsed.newPassword, 12);
    await updateUserPasswordById({
      userId: user.id,
      passwordHash,
    });

    return res.status(200).json({ ok: true, message: "Password updated successfully." });
  } catch (error) {
    if (error instanceof z.ZodError) {
      await logAuthRejection(req, {
        reasonCode: "RESET_PASSWORD_VALIDATION_FAILED",
        payload: { issues: error.issues.map((issue) => issue.path.join(".") || issue.code) },
      });
    }
    return res.status(400).json({
      ok: false,
      code: "RESET_PASSWORD_FAILED",
      message: "Unable to reset password.",
    });
  }
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  try {
    const appUserId = req.auth?.appUserId;
    if (!appUserId) {
      return res.status(401).json({ ok: false, code: "INVALID_TOKEN" });
    }

    const user = await getUserById(appUserId);
    if (!user) {
      return res.status(404).json({ ok: false, code: "USER_NOT_FOUND" });
    }

    return res.json({
      ok: true,
      user: {
        appUserId: user.id,
        fullName: user.full_name,
        phoneNumber: user.phone_number,
        username: user.username,
        email: user.email,
        emailVerifiedAt: user.email_verified_at,
        tokenVersion: user.token_version ?? 0,
      },
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      code: "AUTH_ME_FAILED",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/api/auth/logout-all-devices", authMiddleware, async (req, res) => {
  try {
    const appUserId = req.auth?.appUserId;
    if (!appUserId) {
      return res.status(401).json({ ok: false, code: "INVALID_TOKEN" });
    }

    const nextTokenVersion = await bumpUserTokenVersion({ userId: appUserId });
    return res.status(200).json({
      ok: true,
      tokenVersion: nextTokenVersion,
      message: "Logged out from all devices.",
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      code: "LOGOUT_ALL_DEVICES_FAILED",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.delete("/api/auth/account", authMiddleware, async (req, res) => {
  try {
    const appUserId = req.auth?.appUserId;
    if (!appUserId) {
      return res.status(401).json({ ok: false, code: "INVALID_TOKEN" });
    }

    const deleted = await deleteUserAccountById({ userId: appUserId });
    if (!deleted) {
      return res.status(404).json({ ok: false, code: "USER_NOT_FOUND" });
    }

    return res.status(200).json({
      ok: true,
      message: "Account deleted successfully.",
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      code: "DELETE_ACCOUNT_FAILED",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/api/client-errors", async (req, res) => {
  try {
    const parsed = clientErrorSchema.parse(req.body);
    const auth = req.header("authorization");
    let appUserId = null;

    if (auth?.startsWith("Bearer ")) {
      const token = auth.slice("Bearer ".length).trim();
      const secret = process.env.AUTH_JWT_SECRET;
      if (secret) {
        try {
          const payload = jwt.verify(token, secret);
          appUserId = payload?.appUserId ?? null;
        } catch {
          appUserId = null;
        }
      }
    }

    await saveClientErrorEvent({
      userId: appUserId,
      platform: parsed.platform,
      message: parsed.message,
      stack: parsed.stack,
      metadata: parsed.metadata,
    });

    return res.status(200).json({ ok: true });
  } catch {
    return res.status(400).json({ ok: false, code: "CLIENT_ERROR_LOG_FAILED" });
  }
});

app.post("/api/billing/google-play/rtdn", async (req, res) => {
  const sharedSecret = process.env.RTDN_SHARED_SECRET;
  if (sharedSecret) {
    const incoming = req.header("x-rtdn-secret");
    if (!incoming || incoming !== sharedSecret) {
      return res.status(401).json({ ok: false, code: "UNAUTHORIZED_RTND" });
    }
  }

  const messageData = req.body?.message?.data;
  const payload = decodeRtdnMessage(messageData);

  if (!payload) {
    return res.status(202).json({ ok: true });
  }

  const purchaseToken = payload?.subscriptionNotification?.purchaseToken;
  if (!purchaseToken) {
    return res.status(202).json({ ok: true });
  }

  try {
    const existing = await getSubscriptionByToken(purchaseToken);
    if (!existing?.user_id) {
      await saveBillingEvent({
        userId: null,
        eventType: "rtdn_unknown_token",
        purchaseToken,
        payload,
      });
      return res.status(202).json({ ok: true });
    }

    await syncOnePurchase({
      appUserId: existing.user_id,
      purchaseToken,
    });

    await saveBillingEvent({
      userId: existing.user_id,
      eventType: "rtdn_sync",
      purchaseToken,
      payload,
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    await saveBillingEvent({
      userId: null,
      eventType: "rtdn_sync_failed",
      purchaseToken,
      payload: {
        payload,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    return res.status(202).json({ ok: true });
  }
});

app.post("/api/billing/google-play/verify", async (req, res) => {
  try {
    const parsed = verifyBodySchema.parse(req.body);
    const existingToken = await getSubscriptionByToken(parsed.purchaseToken);

    // Token replay protection: same token cannot be bound to another app user.
    if (existingToken && existingToken.user_id !== parsed.appUserId) {
      return res.status(409).json({
        ok: false,
        code: "TOKEN_ALREADY_USED",
      });
    }

    const verified = await syncOnePurchase({
      appUserId: parsed.appUserId,
      purchaseToken: parsed.purchaseToken,
    });

    if (verified.productId !== parsed.productId) {
      return res.status(400).json({
        ok: false,
        code: "PRODUCT_ID_MISMATCH",
      });
    }

    return res.json({
      ok: true,
      premiumActive: verified.entitlementActive,
      productId: verified.productId,
      expiresAt: verified.expiryTime?.toISOString() ?? null,
      state: verified.subscriptionState,
      isRefunded: verified.isRefunded,
      autoRenewing: verified.isAutoRenewing,
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      code: "VERIFY_FAILED",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// ═══════════════════════════════════════════════════════
// PAYPAL WEBHOOK
// ═══════════════════════════════════════════════════════
app.post("/api/billing/paypal-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    const event = JSON.parse(rawBody);

    const eventType = event.event_type ?? "";
    const resource = event.resource ?? {};

    const buyerEmail = resource?.subscriber?.email_address
      ?? resource?.payer?.email_address
      ?? resource?.custom_id
      ?? "";

    if (!buyerEmail) {
      await saveBillingEvent({ userId: null, provider: "paypal", eventType: `paypal_${eventType}`, purchaseToken: resource?.id ?? "unknown", payload: event });
      return res.status(200).json({ ok: true, message: "No buyer email found" });
    }

    const emailNormalized = normalizeEmail(buyerEmail);
    const user = await getUserByEmail(emailNormalized);

    if (!user?.id) {
      await saveBillingEvent({ userId: null, provider: "paypal", eventType: `paypal_user_not_found`, purchaseToken: resource?.id ?? "unknown", payload: { ...event, attemptedEmail: buyerEmail } });
      return res.status(200).json({ ok: true, message: "User not found for this email" });
    }

    const subscriptionId = resource?.id ?? resource?.billing_agreement_id ?? `paypal_${Date.now()}`;

    const isActivation = [
      "PAYMENT.SALE.COMPLETED",
      "BILLING.SUBSCRIPTION.ACTIVATED",
      "BILLING.SUBSCRIPTION.RE-ACTIVATED",
      "CHECKOUT.ORDER.APPROVED",
    ].includes(eventType);

    const isDeactivation = [
      "BILLING.SUBSCRIPTION.CANCELLED",
      "BILLING.SUBSCRIPTION.EXPIRED",
      "BILLING.SUBSCRIPTION.SUSPENDED",
      "PAYMENT.SALE.REFUNDED",
      "PAYMENT.SALE.REVERSED",
    ].includes(eventType);

    if (isActivation) {
      const productId = resource?.plan_id ?? "premium_monthly";
      const expiresAt = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000);

      await ensureUser(user.id);
      await upsertWebhookSubscription({
        userId: user.id,
        provider: "paypal",
        productId,
        purchaseToken: subscriptionId,
        subscriptionState: "ACTIVE",
        isAutoRenewing: true,
        expiresAt,
        rawPayload: event,
      });

      await saveBillingEvent({ userId: user.id, provider: "paypal", eventType: `paypal_activated`, purchaseToken: subscriptionId, payload: event });
    } else if (isDeactivation) {
      await upsertWebhookSubscription({
        userId: user.id,
        provider: "paypal",
        productId: resource?.plan_id ?? "premium_monthly",
        purchaseToken: subscriptionId,
        subscriptionState: "CANCELLED",
        isAutoRenewing: false,
        expiresAt: new Date(),
        rawPayload: event,
      });

      await saveBillingEvent({ userId: user.id, provider: "paypal", eventType: `paypal_deactivated`, purchaseToken: subscriptionId, payload: event });
    } else {
      await saveBillingEvent({ userId: user.id, provider: "paypal", eventType: `paypal_${eventType}`, purchaseToken: subscriptionId, payload: event });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("PayPal webhook error:", error);
    return res.status(500).json({ ok: false, message: "Webhook processing failed" });
  }
});

// ═══════════════════════════════════════════════════════
// GUMROAD WEBHOOK
// ═══════════════════════════════════════════════════════
app.post("/api/billing/gumroad-webhook", express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const payload = req.body ?? {};

    if (GUMROAD_WEBHOOK_SECRET) {
      const signature = payload.signature ?? "";
      if (!signature) {
        return res.status(401).json({ ok: false, message: "Missing signature" });
      }
      const base = [
        payload.email ?? "",
        payload.product_id ?? "",
        payload.product_name ?? "",
        payload.order_number ?? "",
        payload.subscription_id ?? "",
      ].join("|");
      const expected = createHmac("sha256", GUMROAD_WEBHOOK_SECRET).update(base).digest("hex");
      if (signature !== expected) {
        return res.status(401).json({ ok: false, message: "Invalid signature" });
      }
    }

    const buyerEmail = payload.email ?? "";
    const isCancelled = payload.cancelled === "true" || payload.cancelled === true;
    const isRefunded = payload.refunded === "true" || payload.refunded === true;

    if (!buyerEmail) {
      await saveBillingEvent({ userId: null, provider: "gumroad", eventType: "gumroad_no_email", purchaseToken: payload.subscription_id ?? payload.order_number ?? "unknown", payload });
      return res.status(200).json({ ok: true });
    }

    const emailNormalized = normalizeEmail(buyerEmail);
    const user = await getUserByEmail(emailNormalized);

    if (!user?.id) {
      await saveBillingEvent({ userId: null, provider: "gumroad", eventType: "gumroad_user_not_found", purchaseToken: payload.subscription_id ?? payload.order_number ?? "unknown", payload: { ...payload, attemptedEmail: buyerEmail } });
      return res.status(200).json({ ok: true, message: "User not found" });
    }

    const gumroadToken = payload.subscription_id || payload.order_number || `gumroad_${Date.now()}`;
    const productId = payload.product_id ?? "premium_monthly";

    if (isCancelled || isRefunded) {
      await upsertWebhookSubscription({
        userId: user.id,
        provider: "gumroad",
        productId,
        purchaseToken: gumroadToken,
        subscriptionState: "CANCELLED",
        isAutoRenewing: false,
        expiresAt: new Date(),
        rawPayload: payload,
      });

      await saveBillingEvent({ userId: user.id, provider: "gumroad", eventType: "gumroad_deactivated", purchaseToken: gumroadToken, payload });
    } else {
      const expiresAt = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000);

      await ensureUser(user.id);
      await upsertWebhookSubscription({
        userId: user.id,
        provider: "gumroad",
        productId,
        purchaseToken: gumroadToken,
        subscriptionState: "ACTIVE",
        isAutoRenewing: true,
        expiresAt,
        rawPayload: payload,
      });

      await saveBillingEvent({ userId: user.id, provider: "gumroad", eventType: "gumroad_activated", purchaseToken: gumroadToken, payload });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Gumroad webhook error:", error);
    return res.status(500).json({ ok: false, message: "Webhook processing failed" });
  }
});

// ═══════════════════════════════════════════════════════
// NEW ENTITLEMENT ENDPOINT (replaces old one)
// ═══════════════════════════════════════════════════════
app.get("/api/billing/entitlement/:appUserId", async (req, res) => {
  try {
    const appUserId = req.params.appUserId;

    // 1. Check PayPal/Gumroad subscriptions first (fast, no external API call)
    const webhookSub = await getActiveWebhookSubscription(appUserId);

    if (webhookSub) {
      return res.json({
        ok: true,
        premiumActive: true,
        productId: webhookSub.product_id ?? null,
        expiresAt: webhookSub.expires_at ?? null,
        state: webhookSub.subscription_state ?? null,
      });
    }

    // 2. Fallback: check Google Play subscriptions (for any existing GP users)
    const subscriptions = await getSubscriptionsByUser(appUserId);
    const googlePlaySubs = subscriptions.filter((sub) => sub.provider === "google_play");

    for (const sub of googlePlaySubs) {
      try {
        await syncOnePurchase({ appUserId, purchaseToken: sub.purchase_token });
      } catch {
        await saveBillingEvent({ userId: appUserId, eventType: "refresh_failed", purchaseToken: sub.purchase_token, payload: { reason: "google_refresh_failed" } });
      }
    }

    const entitlement = await getActiveEntitlement(appUserId);
    return res.json({
      ok: true,
      premiumActive: Boolean(entitlement),
      productId: entitlement?.product_id ?? null,
      expiresAt: entitlement?.expires_at ?? null,
      state: entitlement?.subscription_state ?? null,
    });
  } catch (error) {
    return res.status(400).json({ ok: false, code: "ENTITLEMENT_CHECK_FAILED", message: error instanceof Error ? error.message : "Unknown error" });
  }
});

// ═══════════════════════════════════════════════════════
// AMAZON IAP VERIFICATION
// ═══════════════════════════════════════════════════════
const AMAZON_SHARED_SECRET = process.env.AMAZON_SHARED_SECRET ?? "";
const AMAZON_ALLOWED_SKUS = (process.env.AMAZON_ALLOWED_SKUS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const AMAZON_SANDBOX = process.env.AMAZON_SANDBOX === "true";

const amazonVerifyReceiptSchema = z.object({
  receipt: z.object({
    receiptId: z.string().min(1),
    sku: z.string().min(1),
    productType: z.string().optional(),
    purchaseDate: z.number().nullable().optional(),
    cancelDate: z.number().nullable().optional(),
  }),
  sku: z.string().min(1),
  userId: z.string().min(1), // obligatoire en production Amazon RVS
  marketplace: z.string().nullable().optional(),
});

async function verifyAmazonReceipt({ userId, receiptId }) {
  if (!AMAZON_SHARED_SECRET) {
    throw new Error("AMAZON_SHARED_SECRET is not configured");
  }

  const baseUrl = AMAZON_SANDBOX
    ? "https://appstore-sdk.amazon.com/sandbox"
    : "https://appstore-sdk.amazon.com";

  const url = `${baseUrl}/version/1.0/verifyReceiptId/developer/${AMAZON_SHARED_SECRET}/user/${userId}/receiptId/${receiptId}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Amazon RVS error: ${response.status} - ${text}`);
  }

  const data = await response.json();
  return data;
}

app.post("/api/billing/entitlement-amazon/:appUserId", async (req, res) => {
  try {
    const appUserId = req.params.appUserId;

    if (!appUserId || appUserId.length < 3) {
      return res.status(400).json({
        ok: false,
        code: "INVALID_USER_ID",
        message: "Invalid appUserId",
      });
    }

    const parsed = amazonVerifyReceiptSchema.parse(req.body);
    const receipt = parsed.receipt;
    const amazonUserId = parsed.userId;
    const marketplace = parsed.marketplace ?? null;

    if (parsed.sku !== receipt.sku) {
      return res.status(400).json({
        ok: false,
        code: "SKU_MISMATCH",
        message: "sku and receipt.sku must match",
      });
    }

    if (AMAZON_ALLOWED_SKUS.length > 0 && !AMAZON_ALLOWED_SKUS.includes(receipt.sku)) {
      return res.status(400).json({
        ok: false,
        code: "SKU_NOT_ALLOWED",
        message: "SKU not allowed",
      });
    }

    let verificationResult;
    try {
      verificationResult = await verifyAmazonReceipt({
        userId: amazonUserId,
        receiptId: receipt.receiptId,
      });
    } catch (verifyError) {
      await saveBillingEvent({
        userId: appUserId,
        provider: "amazon",
        eventType: "amazon_verify_failed",
        purchaseToken: receipt.receiptId,
        payload: {
          error: verifyError instanceof Error ? verifyError.message : "Verification failed",
          receipt,
          amazonUserId,
          marketplace,
        },
      });

      return res.status(400).json({
        ok: false,
        code: "AMAZON_VERIFY_FAILED",
        message: verifyError instanceof Error ? verifyError.message : "Receipt verification failed",
      });
    }

    const rvsProductId = verificationResult?.productId ?? verificationResult?.termSku ?? null;
    if (rvsProductId && rvsProductId !== receipt.sku) {
      return res.status(400).json({
        ok: false,
        code: "RVS_SKU_MISMATCH",
        message: "RVS productId does not match receipt.sku",
      });
    }

    const cancelDateMs = Number(verificationResult?.cancelDate ?? receipt.cancelDate ?? 0) || 0;
    const renewalDateMs = Number(verificationResult?.renewalDate ?? 0) || 0;
    const now = Date.now();

    const expiresAtDate = renewalDateMs > 0
      ? new Date(renewalDateMs)
      : cancelDateMs > 0
      ? new Date(cancelDateMs)
      : null;

    const isCancelled = cancelDateMs > 0;
    const isExpired = renewalDateMs > 0 ? renewalDateMs <= now : isCancelled;
    const premiumActive = !isCancelled && !isExpired;
    const subscriptionState = premiumActive ? "ACTIVE" : (isCancelled ? "CANCELLED" : "EXPIRED");

    await ensureUser(appUserId);
    await upsertWebhookSubscription({
      userId: appUserId,
      provider: "amazon",
      productId: receipt.sku,
      purchaseToken: receipt.receiptId,
      subscriptionState,
      isAutoRenewing: Boolean(verificationResult?.autoRenewing),
      expiresAt: expiresAtDate ?? new Date(),
      rawPayload: {
        receipt,
        verification: verificationResult,
        amazonUserId,
        marketplace,
      },
    });

    await saveBillingEvent({
      userId: appUserId,
      provider: "amazon",
      eventType: premiumActive ? "amazon_activated" : "amazon_inactive",
      purchaseToken: receipt.receiptId,
      payload: { receipt, verification: verificationResult, amazonUserId, marketplace },
    });

    return res.json({
      ok: true,
      premiumActive,
      productId: receipt.sku,
      expiresAt: expiresAtDate ? expiresAtDate.toISOString() : null,
      state: subscriptionState,
      autoRenewing: Boolean(verificationResult?.autoRenewing),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        code: "INVALID_PAYLOAD",
        message: "Invalid request payload",
        details: error.issues,
      });
    }

    console.error("Amazon entitlement error:", error);
    return res.status(500).json({
      ok: false,
      code: "AMAZON_ENTITLEMENT_FAILED",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.use("/api/license", licenseRoutes);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  // Keep startup log minimal for production logs.
  // eslint-disable-next-line no-console
  console.log(`Billing backend listening on ${port}`);
});



