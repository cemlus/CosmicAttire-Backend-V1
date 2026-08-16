import express, { type Request, type Response, type NextFunction, type ErrorRequestHandler } from "express";
import fs from "fs";
import path from "path";
import routes from "./routes.js";
import espRouter from "./esp/routes.js";
import { env } from "./config.js";
import cors from 'cors';
import { startSyncService } from "./esp/sync.js";
import { attachWebSocketServer, connectToLocalServer } from "./ws/localBridge.js";
import { attachAppWebSocketServer } from "./ws/appBridge.js";
import { getUserIdByShortCode } from "./db/db.js";
import { encrypt } from "./encryptor.js";

export const app = express();

// Railway (and most PaaS) terminate TLS at an edge proxy and forward plain
// HTTP internally, setting X-Forwarded-Proto: https. Without this, req.protocol
// always reads "http" behind that proxy, so every generated networking link
// (GET /api/networking-url/:userId) came back as an http:// URL — it still
// worked (Railway 301-redirects http to https), but every tap-to-open link
// paid for an extra redirect hop it didn't need to.
app.set('trust proxy', 1);

// Was app.use(cors()) — wide open to any origin on a service-role-backed API.
// ESP32s and server-to-server calls send no Origin header and are unaffected;
// this only gates browser requests (the dashboard, the app's web build).
const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
}));

const frontendDir = [
  path.resolve(process.cwd(), "../frontend"),
  path.resolve(process.cwd(), "frontend"),
].find((dir) => fs.existsSync(dir));

app.use(express.json());

if (frontendDir) {
  app.use(express.static(frontendDir));

  app.get("/profile/:encryptedId", (_req, res) => {
    res.sendFile(path.join(frontendDir, "index.html"));
  });

  app.get("/verification-1/:encryptedId", (_req, res) => {
    res.sendFile(path.join(frontendDir, "verification.html"));
  });

  // Short link for small NFC tags that can't fit the full /profile/<encryptedId>
  // URL — resolves the code, re-encrypts fresh, and redirects into the
  // existing profile page so the frontend needs no changes of its own.
  app.get("/p/:code", async (req, res) => {
    const userId = await getUserIdByShortCode(req.params.code as string);
    if (!userId) {
      res.status(404).sendFile(path.join(frontendDir, "index.html"));
      return;
    }
    const encryptedId = encrypt(userId);
    res.redirect(302, `/profile/${encodeURIComponent(encryptedId)}`);
  });

} else {
  console.warn("⚠️ Frontend directory not found; browser prototype routes are disabled.");
}

app.use("/api", routes);
// Was a global express.text({type:"*/*"}) catching every non-JSON content
// type app-wide — fine while only the ESP payloads needed it, a landmine for
// the next multipart/form route added anywhere else. Scoped to just the ESP
// router, which is the only consumer that needs a raw-text fallback body.
app.use("/api/esp", express.text({ type: "*/*" }));
app.use("/api/esp", espRouter);

// Catch-all so a blocked CORS origin (or any other thrown error) returns
// clean JSON instead of Express's default HTML error page — restricting
// CORS in §Phase 0 introduced a real rejection path that didn't exist when
// cors() allowed everything, and it needs a matching JSON error shape.
app.use(((err, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  const message = err instanceof Error ? err.message : "Internal server error";
  const status = /not allowed by CORS/.test(message) ? 403 : 500;
  console.error("❌ Unhandled error:", message);
  res.status(status).json({ error: message });
}) as ErrorRequestHandler);

const PORT = env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    startSyncService();
  });
  attachWebSocketServer(server);
  connectToLocalServer();
  attachAppWebSocketServer(server);
}