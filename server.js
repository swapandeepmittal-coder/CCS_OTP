/*  Chandra Color Shoppee — WhatsApp OTP relay (Render / Node web service)
 *  The app POSTs { mobile, otp, secret } here; this service calls Meta's
 *  WhatsApp Cloud API to deliver the OTP. Your Meta token stays here, never
 *  on the public app page.
 *
 *  Set these in Render → your service → Environment:
 *    META_TOKEN       = your permanent WhatsApp access token
 *    PHONE_NUMBER_ID  = your WhatsApp phone number ID
 *    TEMPLATE_NAME    = approved OTP template name (e.g. ccs_otp)
 *    TEMPLATE_LANG    = template language code (e.g. en_US)
 *    SHARED_SECRET    = the same value you paste in the app
 *    DEFAULT_CC       = default country code digits, e.g. 91   (optional)
 *    BUTTON_OTP       = 1  for Authentication templates that have a copy-code button
 *  (PORT is provided by Render automatically.)
 */
const express = require("express");
const app = express();
app.use(express.json());

// CORS so the app page (github.io) can POST here
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/", (_req, res) => res.send("CCS WhatsApp OTP relay is running."));

// TEMP: secret-gated Graph GET passthrough (remove later).  POST /g { secret, path }
app.post("/g", async (req, res) => {
  const { secret, path } = req.body || {};
  if (!process.env.SHARED_SECRET || secret !== process.env.SHARED_SECRET)
    return res.status(401).json({ error: "unauthorized" });
  if (!path) return res.status(400).json({ error: "path required" });
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${path}`,
      { headers: { Authorization: `Bearer ${process.env.META_TOKEN}` } });
    return res.status(r.status).json(await r.json().catch(() => ({})));
  } catch (e) {
    return res.status(502).json({ error: String(e) });
  }
});

// TEMP: secret-gated Graph POST passthrough (remove later).  POST /gp { secret, path, body }
app.post("/gp", async (req, res) => {
  const { secret, path, body } = req.body || {};
  if (!process.env.SHARED_SECRET || secret !== process.env.SHARED_SECRET)
    return res.status(401).json({ error: "unauthorized" });
  if (!path) return res.status(400).json({ error: "path required" });
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${path}`,
      { method: "POST",
        headers: { Authorization: `Bearer ${process.env.META_TOKEN}`,
                   "Content-Type": "application/json" },
        body: JSON.stringify(body || {}) });
    return res.status(r.status).json(await r.json().catch(() => ({})));
  } catch (e) {
    return res.status(502).json({ error: String(e) });
  }
});

app.post("/", async (req, res) => {
  const { mobile, otp, secret, staff } = req.body || {};
  if (!process.env.SHARED_SECRET || secret !== process.env.SHARED_SECRET)
    return res.status(401).json({ error: "unauthorized" });
  if (!mobile || !otp)
    return res.status(400).json({ error: "mobile and otp required" });

  let to = ("" + mobile).replace(/\D/g, "");
  const cc = (process.env.DEFAULT_CC || "").replace(/\D/g, "");
  if (cc && to.length <= 10) to = cc + to;

  // body carries the OTP as {{1}}; if a staff name is sent, it becomes {{2}}
  // (for a branded Utility template). Add the copy-code button only when
  // BUTTON_OTP=1 (required for Meta Authentication templates).
  const bodyParams = [{ type: "text", text: "" + otp }];
  if (staff) bodyParams.push({ type: "text", text: "" + staff });
  const components = [
    { type: "body", parameters: bodyParams },
  ];
  if (process.env.BUTTON_OTP === "1" || process.env.BUTTON_OTP === "true") {
    components.push({ type: "button", sub_type: "url", index: "0",
      parameters: [{ type: "text", text: "" + otp }] });
  }
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: process.env.TEMPLATE_NAME,
      language: { code: process.env.TEMPLATE_LANG || "en" },
      components,
    },
  };

  try {
    const r = await fetch(
      `https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/messages`,
      { method: "POST",
        headers: { Authorization: `Bearer ${process.env.META_TOKEN}`,
                   "Content-Type": "application/json" },
        body: JSON.stringify(payload) }
    );
    const out = await r.json().catch(() => ({}));
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok, status: r.status, meta: out });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("OTP relay listening on " + PORT));
