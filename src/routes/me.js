import express from "express";
import { deleteSession } from "../store.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { webhookRingBuffer } from "./webhooks.js";
import { getPageMetadata, listPagePosts, getInstagramAccountMetadata } from "../services/graph.js";

const router = express.Router();

// Helper to resolve page by page_id
function getAuthorizedPageById(req, pageId) {
  if (!pageId) return null;
  return req.session?.pages?.find((page) => page.page_id === pageId);
}

// Helper to resolve page by ig_business_account_id
function getAuthorizedPageByIgId(req, accountId) {
  if (!accountId) return null;
  return req.session?.pages?.find((page) => page.ig_business_account_id === accountId);
}

// GET /api/me
router.get("/me", requireAuth, (req, res) => {
  return res.json({ fb_user_id: req.session.fb_user_id });
});

// GET /api/accounts
router.get("/accounts", requireAuth, (req, res) => {
  const sanitizedPages = (req.session.pages || []).map((page) => ({
    page_id: page.page_id,
    page_name: page.page_name,
    ig_business_account_id: page.ig_business_account_id,
    ig_username: page.ig_username
  }));

  return res.json(sanitizedPages);
});

// GET /api/webhook-events
router.get("/webhook-events", requireAuth, (req, res) => {
  return res.json(webhookRingBuffer);
});

// GET /api/page/metadata
router.get("/page/metadata", requireAuth, async (req, res) => {
  const pageId = req.query.page_id;
  if (!pageId) {
    return res.status(400).json({ error: "Missing page_id query parameter." });
  }

  const page = getAuthorizedPageById(req, pageId);
  if (!page) {
    return res.status(403).json({ error: "Access denied or page not found in session." });
  }

  try {
    const data = await getPageMetadata(page.page_id, page.page_access_token);
    return res.json(data);
  } catch (err) {
    console.error("[me] Failed to retrieve page metadata:", err);
    return res.status(500).json({ error: "Failed to retrieve page metadata." });
  }
});

// GET /api/page/posts
router.get("/page/posts", requireAuth, async (req, res) => {
  const pageId = req.query.page_id;
  if (!pageId) {
    return res.status(400).json({ error: "Missing page_id query parameter." });
  }

  const page = getAuthorizedPageById(req, pageId);
  if (!page) {
    return res.status(403).json({ error: "Access denied or page not found in session." });
  }

  try {
    const response = await listPagePosts(page.page_id, page.page_access_token);
    const posts = response?.data || [];
    return res.json(posts);
  } catch (err) {
    console.error("[me] Failed to retrieve page posts:", err);
    return res.status(500).json({ error: "Failed to retrieve page posts." });
  }
});

// GET /api/instagram/metadata
router.get("/instagram/metadata", requireAuth, async (req, res) => {
  const accountId = req.query.account_id;
  if (!accountId) {
    return res.status(400).json({ error: "Missing account_id query parameter." });
  }

  const page = getAuthorizedPageByIgId(req, accountId);
  if (!page) {
    return res.status(403).json({ error: "Access denied or account not found in session." });
  }

  try {
    const data = await getInstagramAccountMetadata(accountId, page.page_access_token);
    return res.json(data);
  } catch (err) {
    console.error("[me] Failed to retrieve instagram metadata:", err);
    return res.status(500).json({ error: "Failed to retrieve instagram metadata." });
  }
});

// POST /api/logout
router.post("/logout", requireAuth, (req, res) => {
  deleteSession(req.sessionId);
  return res.json({ ok: true });
});

export default router;
