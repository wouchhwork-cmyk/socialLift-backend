import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  listConversations,
  listMessages,
  sendMessage
} from "../services/graph.js";

const router = express.Router();

// Helper to resolve page by account_id (ig_business_account_id)
function getAuthorizedPage(req, accountId) {
  if (!accountId) return null;
  return req.session?.pages?.find(
    (page) => page.ig_business_account_id === accountId
  );
}

// GET /api/conversations?account_id=...
router.get("/conversations", requireAuth, async (req, res) => {
  const accountId = req.query.account_id;
  if (!accountId) {
    return res.status(400).json({ error: "Missing account_id query parameter." });
  }

  const page = getAuthorizedPage(req, accountId);
  if (!page) {
    return res.status(403).json({ error: "Access denied or account not found in session." });
  }

  try {
    const conversationsResponse = await listConversations(page.page_id, page.page_access_token);
    const conversations = conversationsResponse?.data || [];
    return res.json(conversations);
  } catch (err) {
    console.error("[messages] Failed to retrieve conversations:", err);
    return res.status(500).json({ error: "Failed to retrieve conversations." });
  }
});

// GET /api/conversations/:conversationId/messages?account_id=...
router.get("/conversations/:conversationId/messages", requireAuth, async (req, res) => {
  const { conversationId } = req.params;
  const accountId = req.query.account_id;

  if (!accountId) {
    return res.status(400).json({ error: "Missing account_id query parameter." });
  }

  const page = getAuthorizedPage(req, accountId);
  if (!page) {
    return res.status(403).json({ error: "Access denied or account not found in session." });
  }

  try {
    const messagesResponse = await listMessages(conversationId, page.page_access_token);
    const messages = messagesResponse?.data || [];
    return res.json(messages);
  } catch (err) {
    console.error(`[messages] Failed to retrieve messages for conversation ${conversationId}:`, err);
    return res.status(500).json({ error: "Failed to retrieve messages." });
  }
});

// POST /api/messages/send
router.post("/messages/send", requireAuth, async (req, res) => {
  const { account_id, recipient_id, message } = req.body;

  if (!account_id) {
    return res.status(400).json({ error: "Missing account_id body parameter." });
  }
  if (!recipient_id) {
    return res.status(400).json({ error: "Missing recipient_id body parameter." });
  }
  if (!message) {
    return res.status(400).json({ error: "Missing message body parameter." });
  }

  const page = getAuthorizedPage(req, account_id);
  if (!page) {
    return res.status(403).json({ error: "Access denied or account not found in session." });
  }

  try {
    const response = await sendMessage(recipient_id, message, page.page_access_token);
    return res.json(response);
  } catch (err) {
    const metaError = err.metaError;
    if (metaError) {
      const isWindowError =
        metaError.error_subcode === 2534022 ||
        metaError.code === 10 ||
        (metaError.message && metaError.message.includes("allowed window"));
      if (isWindowError) {
        return res.status(400).json({
          error: "Message cannot be sent because the 24-hour messaging window has closed. The user must initiate contact first."
        });
      }
      return res.status(400).json({
        error: metaError.message || "Failed to send message."
      });
    }
    console.error("[messages] Failed to send message:", err);
    return res.status(500).json({ error: "Failed to send message." });
  }
});

export default router;
