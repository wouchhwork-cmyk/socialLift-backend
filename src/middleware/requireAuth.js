import { getSession } from "../store.js";

// Auth is keyed by `state` — our internal system user id, supplied by the client
// as a query param on every request. No cookies.
export function requireAuth(req, res, next) {
  const state = typeof req.query.state === "string" ? req.query.state.trim() : "";

  if (!state) {
    console.warn("[requireAuth] Missing state query param. query:", req.query);
    return res.status(401).json({ error: "not authenticated" });
  }

  const session = getSession(state);
  if (!session) {
    console.warn(`[requireAuth] No session found for state ${state}.`);
    return res.status(401).json({ error: "not authenticated" });
  }

  req.session = session;
  req.sessionId = state;
  return next();
}
