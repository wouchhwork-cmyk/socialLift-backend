import express from "express";
import cors from "cors";
import morgan from "morgan";
import { config } from "./config.js";

const app = express();

if (process.env.SERVE_FRONTEND) {
  app.use(express.static(process.env.SERVE_FRONTEND));
}

app.set("trust proxy", 1);

app.use(morgan("dev"));

// CORS: accept calls from any origin (no restriction). Auth travels in the
// `state` query param, not cookies, so credentials are not needed and the
// origin can be a wildcard.
const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options("/{*any}", cors(corsOptions));

// Future Meta webhook routes must be registered before express.json()
// so /webhooks/meta can use express.raw({ type: "application/json" }).
// Do not parse that webhook body as JSON before signature verification.
// Helper to unwrap default exports when bundled to CommonJS by Netlify/esbuild
const unwrap = (mod) => (mod && mod.default ? mod.default : mod);

import webhooksRouter from "./routes/webhooks.js";
app.use(
  "/webhooks/meta",
  express.raw({ type: "application/json" }),
  unwrap(webhooksRouter),
);

app.use(express.json());

// --- Full request/response logging (DEMO/DEBUG ONLY) ---
// Logs every inbound API call with complete, UNMASKED detail: method, URL,
// query, headers, request body, and the response body returned to the client.
// Output is pretty-printed for human readability. This intentionally prints any
// tokens or sensitive values in cleartext for debugging. Do not enable in a
// real production deploy.
app.use((req, res, next) => {
  const start = Date.now();
  const pretty = (value) => JSON.stringify(value ?? {}, null, 2);

  console.log(`\n──────── REQUEST: ${req.method} ${req.originalUrl} ────────`);
  console.log("query:", pretty(req.query));
  console.log("headers:", pretty(req.headers));
  console.log("body:", pretty(req.body));

  // Capture the response body the client receives.
  let responseBody;
  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    responseBody = payload;
    return originalJson(payload);
  };

  res.on("finish", () => {
    console.log(`──────── RESPONSE: ${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms) ────────`);
    if (responseBody !== undefined) {
      console.log("body:", pretty(responseBody));
    }
    console.log("");
  });
  next();
});

import authRouter from "./routes/auth.js";
app.use("/auth", unwrap(authRouter));

import meRouter from "./routes/me.js";
app.use("/api", unwrap(meRouter));

import commentsRouter from "./routes/comments.js";
app.use("/api", unwrap(commentsRouter));

import messagesRouter from "./routes/messages.js";
app.use("/api", unwrap(messagesRouter));


app.get("/", (_req, res) => {
  res.json({ ok: true, service: "sociallift-backend" });
});

app.get("/health", (_req, res) => {
  console.log("hii");
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  console.error("[server] Unhandled request error:", err);
  res.status(500).json({ error: "Internal server error" });
});

if (process.env.NODE_ENV !== "test" && !process.env.NETLIFY) {
  app.listen(config.PORT, () => {
    console.log(`[server] CORS: allowing all origins`);
    console.log(`[server] Listening on port ${config.PORT}`);
  });
}

export { app };
