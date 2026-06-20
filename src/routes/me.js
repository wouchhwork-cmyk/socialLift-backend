import express from "express";
import { deleteSession } from "../store.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

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

// POST /api/logout
router.post("/logout", requireAuth, (req, res) => {
  deleteSession(req.sessionId);
  return res.json({ ok: true });
});

export default router;
