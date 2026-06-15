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
    throw new Error(`Meta Graph API request failed with status ${response.status}.`);
  }

  return data;
}
