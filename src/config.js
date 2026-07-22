import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const isServerless = !!(process.env.NETLIFY || process.env.LAMBDA_TASK_ROOT);

const requiredEnvVars = [
  "FB_APP_ID",
  "FB_APP_SECRET",
  "FB_LOGIN_CONFIG_ID",
  "GRAPH_API_VERSION",
  "OAUTH_REDIRECT_URI",
  "WEBHOOK_VERIFY_TOKEN",
  "SESSION_SECRET",
  "ALLOWED_ORIGIN",
  "FRONTEND_DASHBOARD_URL"
];

if (!isServerless) {
  requiredEnvVars.push("PORT");
}

const missingEnvVars = requiredEnvVars.filter((name) => !process.env[name]?.trim());

if (missingEnvVars.length > 0) {
  const names = missingEnvVars.join(", ");
  throw new Error(`Missing required environment variable(s): ${names}`);
}

const port = process.env.PORT ? Number(process.env.PORT) : 8080;

if (!Number.isInteger(port) || port <= 0) {
  throw new Error("PORT must be a positive integer.");
}

export const config = {
  FB_APP_ID: process.env.FB_APP_ID,
  FB_APP_SECRET: process.env.FB_APP_SECRET,
  FB_LOGIN_CONFIG_ID: process.env.FB_LOGIN_CONFIG_ID,
  GRAPH_API_VERSION: process.env.GRAPH_API_VERSION,
  OAUTH_REDIRECT_URI: process.env.OAUTH_REDIRECT_URI,
  WEBHOOK_VERIFY_TOKEN: process.env.WEBHOOK_VERIFY_TOKEN,
  SESSION_SECRET: process.env.SESSION_SECRET,
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN.replace(/\/+$/, ""),
  PORT: port,
  FRONTEND_DASHBOARD_URL: process.env.FRONTEND_DASHBOARD_URL
};
