// EPHEMERAL — in-memory only, wiped on restart. Replace with a database for production.

const sessions = new Map();

export function getSession(id) {
  return sessions.get(id);
}

export function setSession(id, data) {
  sessions.set(id, data);
  return data;
}

export function updateSession(id, partial) {
  const current = sessions.get(id);

  if (!current) {
    return undefined;
  }

  const next = { ...current, ...partial };
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
