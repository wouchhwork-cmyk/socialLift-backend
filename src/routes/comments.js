import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  listMedia,
  listMediaComments,
  replyToComment,
  hideComment,
  listMentions
} from "../services/graph.js";

const router = express.Router();

// Helper to resolve page by account_id (ig_business_account_id)
function getAuthorizedPage(req, accountId) {
  if (!accountId) return null;
  return req.session?.pages?.find(
    (page) => page.ig_business_account_id === accountId
  );
}

// GET /api/comments?account_id=...
router.get("/comments", requireAuth, async (req, res) => {
  const accountId = req.query.account_id;
  if (!accountId) {
    return res.status(400).json({ error: "Missing account_id query parameter." });
  }

  const page = getAuthorizedPage(req, accountId);
  if (!page) {
    return res.status(403).json({ error: "Access denied or account not found in session." });
  }

  try {
    const mediaResponse = await listMedia(accountId, page.page_access_token);
    const mediaItems = mediaResponse?.data || [];

    // Limit to top 10 recent media items to prevent excessive Graph API queries
    const recentMedia = mediaItems.slice(0, 10);

    const commentsPromises = recentMedia.map(async (media) => {
      try {
        const commentsResponse = await listMediaComments(media.id, page.page_access_token);
        const comments = commentsResponse?.data || [];
        return comments.map((comment) => ({
          ...comment,
          media_id: media.id,
          media_permalink: media.permalink
        }));
      } catch (err) {
        console.error(`[comments] Failed to fetch comments for media ${media.id}:`, err.message);
        return [];
      }
    });

    const commentsResults = await Promise.all(commentsPromises);
    const allComments = commentsResults.flat();

    return res.json(allComments);
  } catch (err) {
    console.error("[comments] Failed to retrieve comments:", err);
    return res.status(500).json({ error: "Failed to retrieve comments." });
  }
});

// POST /api/comments/:commentId/reply
router.post("/comments/:commentId/reply", requireAuth, async (req, res) => {
  const { commentId } = req.params;
  const { message } = req.body;
  const accountId = req.query.account_id || req.body.account_id;

  if (!message) {
    return res.status(400).json({ error: "Missing message body parameter." });
  }
  if (!accountId) {
    return res.status(400).json({ error: "Missing account_id parameter." });
  }

  const page = getAuthorizedPage(req, accountId);
  if (!page) {
    return res.status(403).json({ error: "Access denied or account not found in session." });
  }

  try {
    const response = await replyToComment(commentId, message, page.page_access_token);
    return res.json(response);
  } catch (err) {
    console.error(`[comments] Failed to reply to comment ${commentId}:`, err);
    return res.status(500).json({ error: "Failed to reply to comment." });
  }
});

// POST /api/comments/:commentId/hide
router.post("/comments/:commentId/hide", requireAuth, async (req, res) => {
  const { commentId } = req.params;
  const { hide } = req.body;
  const accountId = req.query.account_id || req.body.account_id;

  if (hide === undefined) {
    return res.status(400).json({ error: "Missing hide body parameter." });
  }
  if (!accountId) {
    return res.status(400).json({ error: "Missing account_id parameter." });
  }

  const page = getAuthorizedPage(req, accountId);
  if (!page) {
    return res.status(403).json({ error: "Access denied or account not found in session." });
  }

  try {
    const response = await hideComment(commentId, !!hide, page.page_access_token);
    return res.json(response);
  } catch (err) {
    console.error(`[comments] Failed to set hide status for comment ${commentId}:`, err);
    return res.status(500).json({ error: "Failed to change comment hide status." });
  }
});

// GET /api/mentions?account_id=...
router.get("/mentions", requireAuth, async (req, res) => {
  const accountId = req.query.account_id;
  if (!accountId) {
    return res.status(400).json({ error: "Missing account_id query parameter." });
  }

  const page = getAuthorizedPage(req, accountId);
  if (!page) {
    return res.status(403).json({ error: "Access denied or account not found in session." });
  }

  try {
    const tagsResponse = await listMentions(accountId, page.page_access_token);
    const taggedMedia = tagsResponse?.data || [];
    return res.json(taggedMedia);
  } catch (err) {
    console.error("[comments] Failed to retrieve mentions/tags:", err);
    return res.status(500).json({ error: "Failed to retrieve mentions." });
  }
});

export default router;
