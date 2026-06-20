// EPHEMERAL — in-memory only, wiped on restart. Replace with a database for production.
//
// Bounded LRU store: keeps at most MAX_SESSIONS sessions. A new login beyond the
// cap evicts the least-recently-used session. Reads and updates "touch" a session
// (move it to most-recently-used), so active and returning users are retained and
// only stale ones are evicted. Set MAX_SESSIONS to 1 for strict single-user.
const MAX_SESSIONS = 5;

const sessions = new Map();

// Move a key to the most-recently-used position (end of Map insertion order).
function touch(id) {
  const data = sessions.get(id);
  sessions.delete(id);
  sessions.set(id, data);
  return data;
}

export function getSession(id) {
  if (!sessions.has(id)) {
    return undefined;
  }
  return touch(id);
}

export function setSession(id, data) {
  // Delete-then-set moves this id to most-recently-used (and overwrites in place
  // if the same user logs in again).
  sessions.delete(id);
  sessions.set(id, data);

  // Evict least-recently-used sessions until within the cap. The first key in a
  // Map is the oldest by insertion/touch order.
  while (sessions.size > MAX_SESSIONS) {
    const oldestId = sessions.keys().next().value;
    sessions.delete(oldestId);
    console.log(`[store] Session cap (${MAX_SESSIONS}) reached — evicted least-recently-used session ${oldestId}.`);
  }

  console.log(`[store] Active sessions: ${sessions.size}/${MAX_SESSIONS} (ids: ${[...sessions.keys()].join(", ")})`);
  return data;
}

export function updateSession(id, partial) {
  const current = sessions.get(id);

  if (!current) {
    return undefined;
  }

  const next = { ...current, ...partial };
  // Re-insert to overwrite and move to most-recently-used.
  sessions.delete(id);
  sessions.set(id, next);
  return next;
}

export function deleteSession(id) {
  return sessions.delete(id);
}

export function findPageBySessionAndId(sessionId, pageId) {
  const session = sessions.get(sessionId);
  return session?.pages?.find((page) => page.page_id === pageId);
}
