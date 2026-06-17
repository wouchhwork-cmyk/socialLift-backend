import crypto from "node:crypto";

import { config } from "../config.js";

const GRAPH_BASE_URL = "https://graph.facebook.com";

export function buildAppSecretProof(accessToken) {
  return crypto
    .createHmac("sha256", config.FB_APP_SECRET)
    .update(accessToken)
    .digest("hex");
}

export async function graphRequest(path, options = {}) {
  const {
    method = "GET",
    params = {},
    body,
    accessToken,
    headers = {}
  } = options;

  if (!accessToken) {
    throw new Error("graphRequest requires accessToken to generate appsecret_proof.");
  }

  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(`${GRAPH_BASE_URL}/${config.GRAPH_API_VERSION}/${cleanPath}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  }

  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("appsecret_proof", buildAppSecretProof(accessToken));

  const requestInit = {
    method,
    headers: {
      Accept: "application/json",
      ...headers
    }
  };

  if (body !== undefined) {
    requestInit.headers["Content-Type"] = "application/json";
    requestInit.body = JSON.stringify(body);
  }

  console.log(`[graph] ${method} ${url.pathname}`);

  const response = await fetch(url, requestInit);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    console.error("[graph] Request failed", {
      status: response.status,
      path: url.pathname,
      error: data?.error
    });
    const err = new Error(`Meta Graph API request failed with status ${response.status}.`);
    err.status = response.status;
    err.metaError = data?.error;
    throw err;
  }

  return data;
}

export async function listMedia(igAccountId, accessToken) {
  return graphRequest(`${igAccountId}/media`, {
    params: {
      fields: "id,caption,media_type,media_url,permalink,timestamp,username,like_count,comments_count"
    },
    accessToken
  });
}

export async function listMediaComments(mediaId, accessToken) {
  return graphRequest(`${mediaId}/comments`, {
    params: {
      fields: "id,text,timestamp,username,like_count,hidden"
    },
    accessToken
  });
}

export async function replyToComment(commentId, message, accessToken) {
  return graphRequest(`${commentId}/replies`, {
    method: "POST",
    params: { message },
    accessToken
  });
}

export async function hideComment(commentId, hide, accessToken) {
  return graphRequest(`${commentId}`, {
    method: "POST",
    params: { hide: hide ? "true" : "false" },
    accessToken
  });
}

export async function listMentions(igAccountId, accessToken) {
  return graphRequest(`${igAccountId}/tags`, {
    params: {
      fields: "id,caption,media_type,media_url,permalink,timestamp,username,like_count,comments_count"
    },
    accessToken
  });
}

export async function listConversations(pageId, accessToken) {
  return graphRequest(`${pageId}/conversations`, {
    params: {
      platform: "instagram",
      fields: "id,link,updated_time,participants"
    },
    accessToken
  });
}

export async function listMessages(conversationId, accessToken) {
  return graphRequest(`${conversationId}/messages`, {
    params: {
      fields: "id,message,created_time,from,to"
    },
    accessToken
  });
}

export async function sendMessage(recipientId, message, accessToken) {
  return graphRequest("me/messages", {
    method: "POST",
    body: {
      recipient: {
        id: recipientId
      },
      message: {
        text: message
      }
    },
    accessToken
  });
}

export async function subscribePageApp(pageId, accessToken, fields = ["messages", "messaging_postbacks", "feed", "mention"]) {
  return graphRequest(`${pageId}/subscribed_apps`, {
    method: "POST",
    params: {
      subscribed_fields: fields.join(",")
    },
    accessToken
  });
}
