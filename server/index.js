import "dotenv/config";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  authenticateByUsernamePassword,
  ensureUser,
  getActiveEntitlement,
  listAuthRejectionEvents,
  getSubscriptionByToken,
  getSubscriptionsByUser,
  getUserById,
  registerUserProfile,
  saveAuthRejectionEvent,
  saveBillingEvent,
  upsertSubscription,
} from "./db.js";
import { verifySubscriptionToken } from "./googlePlay.js";

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? "*" }));
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

const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,24}$/;
const PHONE_REGEX = /^\+[1-9]\d{7,14}$/;
const DEFAULT_BLOCKED_USERNAME_WORDS = ["sex", "porn", "xxx", "nude", "adult", "escort", "camgirl", "onlyfans"];

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

function authMiddleware(req, res, next) {
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

    const token = signAuthToken({
      appUserId: user.id,
      username: user.username,
    });

    return res.status(201).json({
      ok: true,
      token,
      user: {
        appUserId: user.id,
        fullName: user.full_name,
        phoneNumber: user.phone_number,
        username: user.username,
        email: user.email,
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

    const passwordMatches = await bcrypt.compare(parsed.password, user.password_hash);
    if (!passwordMatches) {
      await logAuthRejection(req, {
        reasonCode: "INVALID_CREDENTIALS",
        username: parsed.username,
      });
      return res.status(401).json({ ok: false, code: "INVALID_CREDENTIALS" });
    }

    const token = signAuthToken({
      appUserId: user.id,
      username: user.username,
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

app.get("/api/billing/entitlement/:appUserId", async (req, res) => {
  try {
    const appUserId = req.params.appUserId;
    const subscriptions = await getSubscriptionsByUser(appUserId);

    // On every app open, refresh all known purchase tokens from Google Play.
    for (const sub of subscriptions) {
      try {
        await syncOnePurchase({
          appUserId,
          purchaseToken: sub.purchase_token,
        });
      } catch {
        await saveBillingEvent({
          userId: appUserId,
          eventType: "refresh_failed",
          purchaseToken: sub.purchase_token,
          payload: { reason: "google_refresh_failed" },
        });
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
    return res.status(400).json({
      ok: false,
      code: "ENTITLEMENT_CHECK_FAILED",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  // Keep startup log minimal for production logs.
  // eslint-disable-next-line no-console
  console.log(`Billing backend listening on ${port}`);
});
