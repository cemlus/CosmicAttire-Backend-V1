import type { Server as HttpServer } from "http";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { env } from "../config.js";

const WS_PATH = "/api/ws/local";
const MAX_RECONNECT_DELAY_MS = 30_000;

const clients = new Set<WebSocket>();

let localServerSocket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelayMs = 1000;

/**
 * Accept inbound WebSocket connections from a local dev/relay server at
 * wss://<host>/api/ws/local?token=<WS_SHARED_SECRET>. Mounted on the same
 * HTTP server (not a separate port) via the `upgrade` event, same pattern
 * Express itself uses under the hood.
 */
export function attachWebSocketServer(server: HttpServer): void {
  if (!env.WS_SHARED_SECRET) {
    console.warn("⚠️  WS_SHARED_SECRET not set — inbound local WebSocket connections are disabled");
    return;
  }

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "", "http://localhost");
    if (url.pathname !== WS_PATH) return;

    if (url.searchParams.get("token") !== env.WS_SHARED_SECRET) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws) => {
    clients.add(ws);
    console.log(`🔌 Local relay server connected (${clients.size} active)`);

    ws.on("message", (data: RawData) => {
      console.log("📩 Message from local relay server:", data.toString());
    });

    ws.on("close", () => {
      clients.delete(ws);
      console.log(`🔌 Local relay server disconnected (${clients.size} active)`);
    });

    ws.on("error", (err) => {
      console.error("❌ Local relay WebSocket error:", err.message);
    });
  });

  console.log(`🔌 Local WebSocket endpoint ready at ${WS_PATH}`);
}

/** Push a message to every connected local relay server. */
export function broadcastToLocalClients(data: unknown): void {
  const payload = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

/**
 * Dial out to a local relay server as a WS client (e.g. one exposed over
 * ngrok/a tunnel during development). No-op unless LOCAL_WS_ENABLED=true
 * and LOCAL_WS_URL is set. Reconnects with exponential backoff on drop.
 */
export function connectToLocalServer(): void {
  if (env.LOCAL_WS_ENABLED !== "true") return;

  if (!env.LOCAL_WS_URL) {
    console.warn("⚠️  LOCAL_WS_ENABLED=true but LOCAL_WS_URL not set — skipping outbound connection");
    return;
  }

  dial(env.LOCAL_WS_URL);
}

/** Send a message to the local server, if currently connected. Returns false if not. */
export function sendToLocalServer(data: unknown): boolean {
  if (!localServerSocket || localServerSocket.readyState !== WebSocket.OPEN) return false;
  localServerSocket.send(JSON.stringify(data));
  return true;
}

function dial(url: string): void {
  const ws = new WebSocket(url);
  localServerSocket = ws;

  ws.on("open", () => {
    reconnectDelayMs = 1000;
    console.log(`🔌 Connected to local server at ${url}`);
  });

  ws.on("message", (data: RawData) => {
    console.log("📩 Message from local server:", data.toString());
  });

  ws.on("close", () => {
    console.warn(`🔌 Local server connection closed — retrying in ${reconnectDelayMs}ms`);
    scheduleReconnect(url);
  });

  ws.on("error", (err) => {
    console.error("❌ Local server WebSocket error:", err.message);
  });
}

function scheduleReconnect(url: string): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
    dial(url);
  }, reconnectDelayMs);
}
