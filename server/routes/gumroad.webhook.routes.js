const express = require("express");
const crypto = require("crypto");
const { Pool } = require("pg");

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function makeCode() {
  const p = () => crypto.randomBytes(2).toString("hex").toUpperCase();
  return `LIC-${p()}-${p()}-${p()}`;
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// POST /api/webhooks/gumroad?token=...
router.post("/gumroad", async (req, res) => {
  try {
    const token = String(req.query.token || "");
    if (!process.env.GUMROAD_WEBHOOK_SECRET || token !== process.env.GUMROAD_WEBHOOK_SECRET) {
      return res.status(401).send("unauthorized");
    }

    const email = String(req.body.email || "").trim().toLowerCase();
    const productName = String(req.body.product_name || "").toLowerCase();
    const recurrence = String(req.body.recurrence || "").toLowerCase();
    const refunded = String(req.body.refunded || "false") === "true";
    const chargebacked = String(req.body.chargebacked || "false") === "true";

    if (!email) {
      return res.status(400).send("missing email");
    }

    let plan = "monthly";
    let durationDays = 30;
    if (productName.includes("year") || recurrence.includes("year")) {
      plan = "yearly";
      durationDays = 365;
    }

    if (refunded || chargebacked) {
      await pool.query(
        `update licenses
         set status = 'revoked', updated_at = now()
         where lower(customer_email) = lower($1)`,
        [email]
      );
      return res.status(200).send("revoked");
    }

    const existing = await pool.query(
      `select id from licenses
       where lower(customer_email) = lower($1) and status = 'active'
       order by updated_at desc
       limit 1`,
      [email]
    );

    const expiresAt = addDays(durationDays);

    if (existing.rowCount > 0) {
      await pool.query(
        `update licenses
         set plan = $1, source = 'gumroad', expires_at = $2, updated_at = now()
         where id = $3`,
        [plan, expiresAt, existing.rows[0].id]
      );
      return res.status(200).send("updated");
    }

    const code = makeCode();

    await pool.query(
      `insert into licenses
       (code, customer_email, app_user_id, plan, status, source, expires_at, updated_at)
       values ($1, $2, null, $3, 'active', 'gumroad', $4, now())`,
      [code, email, plan, expiresAt]
    );

    return res.status(200).send("created");
  } catch (error) {
    console.error("gumroad webhook error:", error);
    return res.status(500).send("error");
  }
});

module.exports = router;