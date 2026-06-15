import express from "express";
import crypto from "node:crypto";
import { config } from "../config.js";
import { setSession } from "../store.js";
import { graphRequest } from "../services/graph.js";

const router = express.Router();

// GET /auth/facebook/login
router.get("/facebook/login", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");

  // Store state in a signed, httpOnly, Lax cookie for 5 minutes
  res.cookie("oauth_state", state, {
    signed: true,
    httpOnly: true,
    maxAge: 5 * 60 * 1000,
    sameSite: "lax"
  });

  // Build Facebook OAuth dialog URL using Login for Business config_id
  const oauthUrl = new URL(`https://www.facebook.com/${config.GRAPH_API_VERSION}/dialog/oauth`);
  oauthUrl.searchParams.set("client_id", config.FB_APP_ID);
  oauthUrl.searchParams.set("redirect_uri", config.OAUTH_REDIRECT_URI);
  oauthUrl.searchParams.set("config_id", config.FB_LOGIN_CONFIG_ID);
  oauthUrl.searchParams.set("response_type", "code");
  oauthUrl.searchParams.set("state", state);

  console.log(`[auth] Redirecting user to Facebook Login dialog...`);
  return res.redirect(oauthUrl.toString());
});

// Common callback handler to support redirect URIs pointing to either endpoint
async function handleCallback(req, res, next) {
  try {
    const { code, state, error } = req.query;

    if (error) {
      console.error("[auth] OAuth error callback received from Meta:", error, req.query.error_description);
      return res.status(400).json({ error: "OAuth flow aborted by user or provider.", details: req.query.error_description });
    }

    // Verify state to prevent CSRF
    const cookieState = req.signedCookies.oauth_state;
    if (!cookieState || cookieState !== state) {
      console.error("[auth] State verification failed. Expected:", cookieState, "Received:", state);
      return res.status(400).json({ error: "Security check failed: State mismatch. Please try again." });
    }

    // Clear the verification state cookie
    res.clearCookie("oauth_state");

    if (!code) {
      return res.status(400).json({ error: "Authorization code is missing from callback." });
    }

    // 1. Exchange authorization code for short-lived user access token
    const tokenUrl = new URL(`https://graph.facebook.com/${config.GRAPH_API_VERSION}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", config.FB_APP_ID);
    tokenUrl.searchParams.set("client_secret", config.FB_APP_SECRET);
    tokenUrl.searchParams.set("redirect_uri", config.OAUTH_REDIRECT_URI);
    tokenUrl.searchParams.set("code", code);

    console.log("[auth] Exchanging code for short-lived user access token...");
    const shortLivedRes = await fetch(tokenUrl.toString());
    const shortLivedData = await shortLivedRes.json();

    if (!shortLivedRes.ok) {
      console.error("[auth] Short-lived token exchange failed:", JSON.stringify(shortLivedData.error));
      return res.status(500).json({ error: "Failed to exchange authorization code." });
    }

    const shortLivedToken = shortLivedData.access_token;

    // 2. Exchange short-lived token for long-lived user access token
    const longLivedUrl = new URL(`https://graph.facebook.com/${config.GRAPH_API_VERSION}/oauth/access_token`);
    longLivedUrl.searchParams.set("grant_type", "fb_exchange_token");
    longLivedUrl.searchParams.set("client_id", config.FB_APP_ID);
    longLivedUrl.searchParams.set("client_secret", config.FB_APP_SECRET);
    longLivedUrl.searchParams.set("fb_exchange_token", shortLivedToken);

    console.log("[auth] Upgrading short-lived token to long-lived user access token...");
    const longLivedRes = await fetch(longLivedUrl.toString());
    const longLivedData = await longLivedRes.json();

    if (!longLivedRes.ok) {
      console.error("[auth] Long-lived token exchange failed:", JSON.stringify(longLivedData.error));
      return res.status(500).json({ error: "Failed to obtain long-lived user access token." });
    }

    const longLivedToken = longLivedData.access_token;

    // 3. Fetch user profile ID
    console.log("[auth] Fetching user profile info (/me)...");
    const meData = await graphRequest("/me", { accessToken: longLivedToken });
    const fb_user_id = meData.id;

    if (!fb_user_id) {
      console.error("[auth] Graph API returned profile without user ID.");
      return res.status(500).json({ error: "Failed to retrieve user ID from profile." });
    }

    // 4. Fetch user's Pages
    const pageMap = new Map();

    // Query standard /me/accounts
    try {
      console.log("[auth] Querying user accounts (/me/accounts)...");
      const accountsData = await graphRequest("/me/accounts", { accessToken: longLivedToken });
      if (accountsData && Array.isArray(accountsData.data)) {
        for (const page of accountsData.data) {
          if (page.id) {
            pageMap.set(page.id, {
              page_id: page.id,
              page_name: page.name,
              page_access_token: page.access_token
            });
          }
        }
      }
    } catch (err) {
      console.error("[auth] Error querying /me/accounts:", err.message);
    }

    // Query /me/businesses to handle pages managed under Business portfolios (NPE)
    try {
      console.log("[auth] Querying user businesses (/me/businesses)...");
      const businessesData = await graphRequest("/me/businesses", { accessToken: longLivedToken });
      if (businessesData && Array.isArray(businessesData.data)) {
        for (const biz of businessesData.data) {
          const bizId = biz.id;
          if (!bizId) continue;

          // Fetch owned pages
          try {
            console.log(`[auth] Querying owned_pages for business: ${bizId}`);
            const owned = await graphRequest(`/${bizId}/owned_pages`, { accessToken: longLivedToken });
            if (owned && Array.isArray(owned.data)) {
              for (const page of owned.data) {
                if (page.id && !pageMap.has(page.id)) {
                  pageMap.set(page.id, { page_id: page.id });
                }
              }
            }
          } catch (err) {
            console.error(`[auth] Error querying owned_pages for business ${bizId}:`, err.message);
          }

          // Fetch client pages
          try {
            console.log(`[auth] Querying client_pages for business: ${bizId}`);
            const client = await graphRequest(`/${bizId}/client_pages`, { accessToken: longLivedToken });
            if (client && Array.isArray(client.data)) {
              for (const page of client.data) {
                if (page.id && !pageMap.has(page.id)) {
                  pageMap.set(page.id, { page_id: page.id });
                }
              }
            }
          } catch (err) {
            console.error(`[auth] Error querying client_pages for business ${bizId}:`, err.message);
          }
        }
      }
    } catch (err) {
      console.log("[auth] Business lookup skipped (likely missing business_management permission):", err.message);
    }

    // 5. Gather page access tokens and Instagram Business accounts for each page ID
    const pages = [];
    for (const [pageId, initialData] of pageMap.entries()) {
      try {
        console.log(`[auth] Querying page details & Instagram info for page: ${pageId}`);
        const pageDetails = await graphRequest(`/${pageId}`, {
          accessToken: longLivedToken,
          params: {
            fields: "access_token,name,instagram_business_account{id,username}"
          }
        });

        const page_access_token = pageDetails.access_token || initialData.page_access_token;
        const page_name = pageDetails.name || initialData.page_name;
        const ig_business_account_id = pageDetails.instagram_business_account?.id || null;
        const ig_username = pageDetails.instagram_business_account?.username || null;

        pages.push({
          page_id: pageId,
          page_name: page_name || "Unknown Page",
          page_access_token: page_access_token || null,
          ig_business_account_id,
          ig_username
        });
      } catch (err) {
        console.error(`[auth] Error fetching individual page details for page ${pageId}:`, err.message);
      }
    }

    // 6. Save data in in-memory session store
    const sessionId = crypto.randomUUID();
    const sessionData = { fb_user_id, pages };
    setSession(sessionId, sessionData);

    // 7. Write secure, signed, httpOnly session cookie
    res.cookie("sessionId", sessionId, {
      signed: true,
      httpOnly: true,
      secure: true,
      sameSite: "lax"
    });

    console.log(`[auth] Session created for FB User: ${fb_user_id}. Redirecting to dashboard.`);
    return res.redirect(config.FRONTEND_DASHBOARD_URL);

  } catch (err) {
    console.error("[auth] Callback handler unhandled error:", err.stack || err.message || err);
    return next(err);
  }
}

router.get("/facebook/callback", handleCallback);
router.get("/meta/callback", handleCallback);

export default router;
