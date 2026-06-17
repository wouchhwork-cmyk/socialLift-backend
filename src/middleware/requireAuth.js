import { getSession } from "../store.js";

export function requireAuth(req, res, next) {
  const sessionId = req.signedCookies.sessionId;
  
  if (!sessionId) {
    return res.status(401).json({ error: "not authenticated" });
  }

  const session = getSession(sessionId);
  if (!session) {
    return res.status(401).json({ error: "not authenticated" });
  }

  req.session = session;
  req.sessionId = sessionId;
  return next();
}
