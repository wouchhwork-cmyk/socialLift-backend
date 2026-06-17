import { getSession } from "../store.js";

export function requireAuth(req, res, next) {
  const sessionId = req.signedCookies.sessionId;
  
  if (!sessionId) {
    console.warn("[requireAuth] No sessionId found in signedCookies. signedCookies:", req.signedCookies, "cookies:", req.cookies);
    return res.status(401).json({ error: "not authenticated" });
  }

  const session = getSession(sessionId);
  if (!session) {
    console.warn(`[requireAuth] Session ID ${sessionId} not found in store.`);
    return res.status(401).json({ error: "not authenticated" });
  }

  req.session = session;
  req.sessionId = sessionId;
  return next();
}
