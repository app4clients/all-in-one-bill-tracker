const express = require("express");
const { Pool } = require("pg");

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// POST /api/license/activate
// body: { appUserId: string, email: string, licenseCode: string }
router.post("/activate", async (req, res) => {
  const client = await pool.connect();

  try {
    const appUserId = String(req.body.appUserId || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const licenseCode = String(req.body.licenseCode || "").trim().toUpperCase();

    if (!appUserId || !email || !licenseCode) {
      return res.status(400).json({
        ok: false,
        message: "appUserId, email and licenseCode are required",
      });
    }

    await client.query("BEGIN");

    const q = await client.query(
      `
      select id, code, customer_email, app_user_id, plan, status, expires_at
      from licenses
      where upper(code) = upper($1)
      limit 1
      `,
      [licenseCode]
    );

    if (q.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "License code not found" });
    }

    const lic = q.rows[0];
    const now = Date.now();

    if (lic.status !== "active") {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, message: "License is inactive" });
    }

    if (lic.expires_at && new Date(lic.expires_at).getTime() <= now) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, message: "License expired" });
    }

    if ((lic.customer_email || "").toLowerCase() !== email) {
      await client.query("ROLLBACK");
      return res.status(403).json({ ok: false, message: "License email does not match this account" });
    }

    if (lic.app_user_id && lic.app_user_id !== appUserId) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, message: "License already used by another account" });
    }

    const updated = await client.query(
      `
      update licenses
      set app_user_id = $1, updated_at = now()
      where id = $2
      returning plan, expires_at
      `,
      [appUserId, lic.id]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      message: "License activated",
      premiumActive: true,
      productId: `license_${updated.rows[0].plan}`,
      expiresAt: updated.rows[0].expires_at,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("POST /api/license/activate error:", error);
    return res.status(500).json({ ok: false, message: "Server error" });
  } finally {
    client.release();
  }
});

// GET /api/billing/entitlement/:appUserId
router.get("/entitlement/:appUserId", async (req, res) => {
  const client = await pool.connect();

  try {
    const appUserId = String(req.params.appUserId || "").trim();
    if (!appUserId) {
      return res.status(400).json({ ok: false, message: "appUserId is required" });
    }

    const q = await client.query(
      `
      select plan, status, expires_at
      from licenses
      where app_user_id = $1
        and status = 'active'
      order by updated_at desc
      limit 1
      `,
      [appUserId]
    );

    if (q.rowCount === 0) {
      return res.json({
        ok: true,
        premiumActive: false,
        productId: null,
        expiresAt: null,
      });
    }

    const lic = q.rows[0];
    const expired = lic.expires_at ? new Date(lic.expires_at).getTime() <= Date.now() : false;

    if (expired) {
      return res.json({
        ok: true,
        premiumActive: false,
        productId: `license_${lic.plan}`,
        expiresAt: lic.expires_at,
      });
    }

    return res.json({
      ok: true,
      premiumActive: true,
      productId: `license_${lic.plan}`,
      expiresAt: lic.expires_at,
    });
  } catch (error) {
    console.error("GET /api/license/entitlement/:appUserId error:", error);
    return res.status(500).json({ ok: false, message: "Server error" });
  } finally {
    client.release();
  }
});

module.exports = router;