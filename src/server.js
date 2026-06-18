import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";

import { config } from "./config.js";

const app = express();

app.set("trust proxy", 1);

app.use(morgan("dev"));

const corsOptions = {
  origin: config.ALLOWED_ORIGIN,
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Future Meta webhook routes must be registered before express.json()
// so /webhooks/meta can use express.raw({ type: "application/json" }).
// Do not parse that webhook body as JSON before signature verification.
import webhooksRouter from "./routes/webhooks.js";
app.use("/webhooks/meta", express.raw({ type: "application/json" }), webhooksRouter);

app.use(express.json());
app.use(cookieParser(config.SESSION_SECRET));

import authRouter from "./routes/auth.js";
app.use("/auth", authRouter);

import meRouter from "./routes/me.js";
app.use("/api", meRouter);

import commentsRouter from "./routes/comments.js";
app.use("/api", commentsRouter);

import messagesRouter from "./routes/messages.js";
app.use("/api", messagesRouter);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  console.error("[server] Unhandled request error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(config.PORT, () => {
  console.log("[auth] session cookie write name: sessionId");
  console.log("[auth] session cookie read name: sessionId");
  console.log(`[server] Allowed CORS origin: ${config.ALLOWED_ORIGIN}`);
  console.log(`[server] Listening at http://localhost:${config.PORT}`);
});
