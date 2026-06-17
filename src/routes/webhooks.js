import express from "express";
import crypto from "node:crypto";
import { config } from "../config.js";

const router = express.Router();

export const webhookRingBuffer = [];
const MAX_BUFFER_SIZE = 50;

function addWebhookEvent(event) {
  webhookRingBuffer.push({
    receivedAt: new Date().toISOString(),
    payload: event
  });
  if (webhookRingBuffer.length > MAX_BUFFER_SIZE) {
    webhookRingBuffer.shift();
  }
}

// GET /webhooks/meta - verification handshake
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const verifyToken = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && verifyToken === config.WEBHOOK_VERIFY_TOKEN) {
    console.log("[webhook] Handshake successful");
    return res.type("text/plain").send(challenge);
  }

  console.error("[webhook] Handshake failed: Invalid verify token");
  return res.status(403).json({ error: "Forbidden" });
});

// POST /webhooks/meta - receive and verify webhooks
router.post("/", (req, res) => {
  const signature = req.headers["x-hub-signature-256"];
  if (!signature) {
    console.error("[webhook] Missing X-Hub-Signature-256 header");
    return res.status(401).json({ error: "Missing signature" });
  }

  const parts = signature.split("=");
  if (parts.length !== 2 || parts[0] !== "sha256") {
    console.error("[webhook] Invalid signature format");
    return res.status(401).json({ error: "Invalid signature format" });
  }

  const expectedSignature = parts[1];
  
  // Calculate signature over raw body (which is a Buffer due to express.raw)
  const computedSignature = crypto
    .createHmac("sha256", config.FB_APP_SECRET)
    .update(req.body)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const computedBuffer = Buffer.from(computedSignature, "hex");

  if (
    expectedBuffer.length !== computedBuffer.length ||
    !crypto.timingSafeEqual(computedBuffer, expectedBuffer)
  ) {
    console.error("[webhook] Signature verification failed");
    return res.status(401).json({ error: "Signature verification failed" });
  }

  try {
    const rawString = req.body.toString("utf8");
    const body = JSON.parse(rawString);

    if (body && Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        const fields =
          entry.changes?.map((c) => c.field).join(",") ||
          entry.messaging?.map(() => "messaging").join(",") ||
          "unknown";

        console.log(
          `[webhook] Object: ${body.object}, Entry ID: ${entry.id || "none"}, Field/Type: ${fields}`
        );
        addWebhookEvent(entry);
      }
    }

    return res.status(200).send("EVENT_RECEIVED");
  } catch (err) {
    console.error("[webhook] Error parsing webhook body:", err.message);
    return res.status(400).json({ error: "Invalid JSON payload" });
  }
});

export default router;
