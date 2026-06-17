import express from "express";
import crypto from "node:crypto";
import { config } from "../config.js";
import { setSession } from "../store.js";
import { graphRequest, subscribePageApp } from "../services/graph.js";

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
      console.error("[auth] Short-lived token exchange failed. Full Meta error:", JSON.stringify(shortLivedData));
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
      console.error("[auth] Long-lived token exchange failed. Full Meta error:", JSON.stringify(longLivedData));
      return res.status(500).json({ error: "Failed to obtain long-lived user access token." });
    }

    const longLivedToken = longLivedData.access_token;

    // 3. Fetch user profile ID
    let meData;
    try {
      console.log("[auth] Fetching user profile info (/me)...");
      meData = await graphRequest("/me", { accessToken: longLivedToken });
    } catch (err) {
      console.error("[auth] Failed to fetch user profile /me:", err.stack || err.message || err);
      return res.status(500).json({ error: "Failed to fetch user profile info." });
    }

    const fb_user_id = meData.id;
    if (!fb_user_id) {
      console.error("[auth] Graph API returned profile without user ID.");
      return res.status(500).json({ error: "Failed to retrieve user ID from profile." });
    }

    // 4. Fetch user's Pages
    let pages = [];
    let fetchPathUsed = "accounts";

    try {
      console.log("[auth] Querying user accounts (/me/accounts)...");
      const accountsData = await graphRequest("/me/accounts", { accessToken: longLivedToken });
      
      if (accountsData && Array.isArray(accountsData.data) && accountsData.data.length > 0) {
        for (const page of accountsData.data) {
          if (!page.id) continue;

          let page_access_token = page.access_token;
          let page_name = page.name;
          let ig_business_account_id = null;
          let ig_username = null;

          // For NPE pages (or standard ones), get access token, name, and IG account details directly.
          try {
            console.log(`[auth] Querying details for page: ${page.id}`);
            const pageDetails = await graphRequest(`/${page.id}`, {
              accessToken: longLivedToken,
              params: {
                fields: "access_token,name,instagram_business_account{id,username}"
              }
            });

            page_access_token = pageDetails.access_token || page_access_token;
            page_name = pageDetails.name || page_name;
            ig_business_account_id = pageDetails.instagram_business_account?.id || null;
            ig_username = pageDetails.instagram_business_account?.username || null;
          } catch (err) {
            console.error(`[auth] Error querying details for page ${page.id}:`, err.message || err);
          }

          pages.push({
            page_id: page.id,
            page_name: page_name || "Unknown Page",
            page_access_token: page_access_token || null,
            ig_business_account_id,
            ig_username
          });
        }
      } else {
        // Fallback using debug_token and granular_scopes
        fetchPathUsed = "granular_scopes fallback";
        console.log("[auth] /me/accounts returned zero pages. Triggering granular_scopes debug_token fallback...");
        
        const debugTokenUrl = new URL(`https://graph.facebook.com/${config.GRAPH_API_VERSION}/debug_token`);
        debugTokenUrl.searchParams.set("input_token", longLivedToken);
        debugTokenUrl.searchParams.set("access_token", `${config.FB_APP_ID}|${config.FB_APP_SECRET}`);

        const debugRes = await fetch(debugTokenUrl.toString());
        const debugData = await debugRes.json();

        if (!debugRes.ok) {
          console.error("[auth] debug_token API request failed. Full Meta error:", JSON.stringify(debugData));
          throw new Error("Failed to debug user access token during fallback lookup.");
        }

        const granularScopes = debugData?.data?.granular_scopes || [];
        let targetPageIds = [];

        // Find target_ids from pages_show_list, pages_messaging, or pages_read_engagement
        const showListScope = granularScopes.find(s => s.scope === "pages_show_list");
        if (showListScope && Array.isArray(showListScope.target_ids)) {
          targetPageIds = showListScope.target_ids;
        }

        if (targetPageIds.length === 0) {
          const messagingScope = granularScopes.find(s => s.scope === "pages_messaging");
          if (messagingScope && Array.isArray(messagingScope.target_ids)) {
            targetPageIds = messagingScope.target_ids;
          }
        }

        if (targetPageIds.length === 0) {
          const readEngageScope = granularScopes.find(s => s.scope === "pages_read_engagement");
          if (readEngageScope && Array.isArray(readEngageScope.target_ids)) {
            targetPageIds = readEngageScope.target_ids;
          }
        }

        console.log(`[auth] Found ${targetPageIds.length} unique page IDs in debug_token granular_scopes.`);

        // For each granted page ID, fetch details using the user access token
        for (const pageId of targetPageIds) {
          try {
            console.log(`[auth] Querying page details for NPE page ID: ${pageId}`);
            const pageDetails = await graphRequest(`/${pageId}`, {
              accessToken: longLivedToken,
              params: {
                fields: "access_token,name,instagram_business_account{id,username}"
              }
            });

            pages.push({
              page_id: pageId,
              page_name: pageDetails.name || "Unknown Page",
              page_access_token: pageDetails.access_token || null,
              ig_business_account_id: pageDetails.instagram_business_account?.id || null,
              ig_username: pageDetails.instagram_business_account?.username || null
            });
          } catch (err) {
            console.error(`[auth] Error fetching individual page details for ${pageId}:`, err.message || err);
          }
        }
      }
    } catch (err) {
      console.error("[auth] Error fetching user's pages in callback:", err.message || err);
    }

    // Subscribe all Pages to the app
    for (const page of pages) {
      if (page.page_id && page.page_access_token) {
        try {
          console.log(`[auth] Subscribing app to page ${page.page_id}...`);
          await subscribePageApp(page.page_id, page.page_access_token);
          console.log(`[auth] Successfully subscribed app to page ${page.page_id}`);
        } catch (err) {
          console.error(`[auth] Failed to subscribe app to page ${page.page_id}:`, err.message || err);
        }
      }
    }

    // 5. Save data in in-memory session store
    const sessionId = crypto.randomUUID();
    const sessionData = { fb_user_id, pages };
    setSession(sessionId, sessionData);

    const pageSummary = pages.map(p => ({
      page_id: p.page_id,
      page_name: p.page_name,
      has_access_token: !!p.page_access_token,
      ig_business_account_id: p.ig_business_account_id,
      ig_username: p.ig_username
    }));
    console.log(`[auth] Stored session: fb_user_id=${fb_user_id}, pathUsed=${fetchPathUsed}, pageCount=${pages.length}, pages=${JSON.stringify(pageSummary)}`);

    // 6. Write secure, signed, httpOnly session cookie
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
