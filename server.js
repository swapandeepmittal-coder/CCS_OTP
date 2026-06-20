/*  Chandra Color Shoppee — WhatsApp OTP relay (Render / Node web service)
 *  The app POSTs { mobile, otp, secret, staff } here; this service calls Meta's
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
 *    BUTTON_OTP       = 1  for Authentication templates with a copy-code button
 *    TEMPLATE_STAFF   = 1  ONLY if your template has a 2nd {{2}} variable for staff name
 *  (PORT is provided by Render automatically.)
 */
const express = require("express");
const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/", (_req, res) => res.send("CCS WhatsApp OTP relay is running."));

app.post("/", async (req, res) => {
  const { mobile, otp, secret, staff } = req.body || {};
  if (!process.env.SHARED_SECRET || secret !== process.env.SHARED_SECRET)
    return res.status(401).json({ error: "unauthorized" });
  if (!mobile || !otp)
    return res.status(400).json({ error: "mobile and otp required" });

  let to = ("" + mobile).replace(/\D/g, "");
  const cc = (process.env.DEFAULT_CC || "").replace(/\D/g, "");
  if (cc && to.length <= 10) to = cc + to;

  // body carries the OTP as {{1}}; the staff name {{2}} is added ONLY when the
  // template actually has a 2nd variable (set TEMPLATE_STAFF=1). Otherwise we
  // send just the code so Authentication templates (1 variable) work correctly.
  const bodyParams = [{ type: "text", text: "" + otp }];
  if (staff && (process.env.TEMPLATE_STAFF === "1" || process.env.TEMPLATE_STAFF === "true"))
    bodyParams.push({ type: "text", text: "" + staff });
  const components = [{ type: "body", parameters: bodyParams }];
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
