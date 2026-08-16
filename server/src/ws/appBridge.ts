import type { IncomingMessage, Server as HttpServer } from "http";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { supabase } from "../db/supaBaseClient.js";
import { getCurrentUserRow, type UserRow } from "../db/db.js";

const WS_PATH = "/api/ws/app";

interface AppClient {
  ws: WebSocket;
  userId: string;
  role: UserRow["app_role"];
}

interface InboundEnvelope {
  /** Target a single user_id directly. Admin/super_admin senders only. */
  to?: string;
  /** Relay to every connected admin/super_admin. */
  toAdmins?: boolean;
  data: unknown;
}

// A user can have multiple live connections (multiple devices/tabs).
const clientsByUser = new Map<string, Set<AppClient>>();
const adminClients = new Set<AppClient>();

/**
 * Authenticated WebSocket for the customer app and the admin app to
 * exchange data with each other through this server, and with itself
 * (e.g. a future server-pushed balance/tap update).
 *
 * wss://<host>/api/ws/app?token=<supabase access token> — the same
 * session token the REST API already accepts via `Authorization: Bearer`,
 * just passed as a query param since WebSocket handshakes from React
 * Native / browsers can't reliably set custom headers.
 */
export function attachAppWebSocketServer(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "", "http://localhost");
    if (url.pathname !== WS_PATH) return;

    authenticate(url.searchParams.get("token"))
      .then((auth) => {
        if (!auth) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit("connection", ws, req, auth);
        });
      })
      .catch(() => {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
      });
  });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage, auth: { userId: string; role: UserRow["app_role"] }) => {
    const client: AppClient = { ws, userId: auth.userId, role: auth.role };
    addClient(client);
    console.log(`🔌 App client connected: user=${client.userId} role=${client.role}`);

    ws.on("message", (data: RawData) => {
      let envelope: InboundEnvelope;
      try {
        envelope = JSON.parse(data.toString());
      } catch {
        console.warn(`⚠️  Ignoring non-JSON message from ${client.userId}`);
        return;
      }

      if (envelope.to) {
        if (client.role !== "admin" && client.role !== "super_admin") {
          console.warn(`⚠️  ${client.userId} (${client.role}) tried to message ${envelope.to} directly — denied`);
          return;
        }
        sendToUser(envelope.to, { from: client.userId, data: envelope.data });
        return;
      }

      if (envelope.toAdmins) {
        broadcastToAdmins({ from: client.userId, data: envelope.data });
        return;
      }

      console.log(`📩 Message from ${client.userId} (${client.role}):`, envelope.data);
    });

    ws.on("close", () => {
      removeClient(client);
      console.log(`🔌 App client disconnected: user=${client.userId}`);
    });

    ws.on("error", (err) => {
      console.error(`❌ App WebSocket error (${client.userId}):`, err.message);
    });
  });

  console.log(`🔌 App WebSocket endpoint ready at ${WS_PATH}`);
}

/** Push a message to every open connection a specific user has. Returns true if delivered to at least one. */
export function sendToUser(userId: string, data: unknown): boolean {
  const set = clientsByUser.get(userId);
  if (!set || set.size === 0) return false;

  const payload = JSON.stringify(data);
  let delivered = false;
  for (const client of set) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
      delivered = true;
    }
  }
  return delivered;
}

/** Push a message to every connected admin/super_admin. */
export function broadcastToAdmins(data: unknown): void {
  const payload = JSON.stringify(data);
  for (const client of adminClients) {
    if (client.ws.readyState === WebSocket.OPEN) client.ws.send(payload);
  }
}

async function authenticate(token: string | null): Promise<{ userId: string; role: UserRow["app_role"] } | null> {
  if (!token) return null;

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  try {
    const profile = await getCurrentUserRow(user.id);
    if (!profile) return null;
    return { userId: user.id, role: profile.app_role };
  } catch {
    return null;
  }
}

function addClient(client: AppClient): void {
  let set = clientsByUser.get(client.userId);
  if (!set) {
    set = new Set();
    clientsByUser.set(client.userId, set);
  }
  set.add(client);

  if (client.role === "admin" || client.role === "super_admin") {
    adminClients.add(client);
  }
}

function removeClient(client: AppClient): void {
  const set = clientsByUser.get(client.userId);
  if (set) {
    set.delete(client);
    if (set.size === 0) clientsByUser.delete(client.userId);
  }
  adminClients.delete(client);
}
