import { syncConfig } from "./syncConfig.js";
import {
  getUserById,
  getAccessCredentialByMac,
  getUserIdByNFCId,
  getProcessedEvent,
  insertSyncedEvent,
  insertTapLog,
} from "../db/db.js";
import { encrypt } from "../encryptor.js";

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

/** Shape of a tap event buffered on the Data Storage ESP */
interface ESPTapEvent {
  event_id: string;     // e.g. "AA:BB:CC:DD:EE:FF-0042"
  nfc_id: string;       // NFC ring UID
  mac: string;          // Reader ESP MAC address
  reader_id?: string;   // Reader UUID (optional)
  lat?: number;
  lng?: number;
  timestamp: number;    // Unix seconds when the tap occurred
  source?: string;      // "realtime" | "cache" (from ESP perspective)
  approved?: boolean;   // Whether ESP approved locally from cache
}

// ─────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────

let pollIntervalId: ReturnType<typeof setInterval> | null = null;
let isPolling = false; // Guard against overlapping polls

// ─────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────

/**
 * Start the ESP sync polling service.
 * Call once on server boot. Does nothing if disabled or already running.
 */
export function startSyncService(): void {
  if (!syncConfig.enabled) {
    console.log("ℹ️  ESP sync service is disabled (ESP_POLL_ENABLED != 'true')");
    return;
  }

  if (!syncConfig.espStorageUrl) {
    console.warn("⚠️  ESP_STORAGE_URL not set — sync service cannot start");
    return;
  }

  if (pollIntervalId) {
    console.warn("⚠️  ESP sync service is already running");
    return;
  }

  console.log(
    `🔄 ESP sync service starting — polling ${syncConfig.espStorageUrl} every ${syncConfig.pollIntervalMs}ms`
  );

  // Run first poll immediately, then set interval
  pollESP();
  pollIntervalId = setInterval(pollESP, syncConfig.pollIntervalMs);
}

/**
 * Stop the polling service. Used for graceful shutdown and testing.
 */
export function stopSyncService(): void {
  if (pollIntervalId) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
    console.log("🛑 ESP sync service stopped");
  }
}

// ─────────────────────────────────────────────────────
// Core Polling Logic
// ─────────────────────────────────────────────────────

async function pollESP(): Promise<void> {
  // Prevent overlapping polls (if a previous poll is still running)
  if (isPolling) return;
  isPolling = true;

  try {
    // 1. Fetch buffered tap events from ESP
    const events = await fetchLogsFromESP();

    if (!events || events.length === 0) {
      return; // Nothing to process
    }

    console.log(`📥 Received ${events.length} buffered tap event(s) from ESP`);

    // 2. Process each event
    const processedIds: string[] = [];

    for (const event of events) {
      try {
        const result = await processIdentityTap(event);
        if (result) {
          processedIds.push(event.event_id);
        }
      } catch (err) {
        console.error(
          `❌ Failed to process event ${event.event_id}:`,
          (err as Error).message
        );
        // Record failed event in idempotency registry so we don't retry forever
        try {
          await insertSyncedEvent({
            event_id: event.event_id,
            esp_device_id: extractDeviceId(event.event_id),
            tap_log_id: null,
            status: "failed",
            error_message: (err as Error).message,
            raw_payload: event as unknown as Record<string, unknown>,
          });
          processedIds.push(event.event_id); // Still ack so ESP clears it
        } catch {
          // If even recording the failure fails, don't ack — will retry next cycle
        }
      }
    }

    // 3. Acknowledge processed events so ESP clears them
    if (processedIds.length > 0) {
      await acknowledgeEvents(processedIds);
      console.log(`✅ Acknowledged ${processedIds.length} event(s) to ESP`);
    }
  } catch (err) {
    // ESP unreachable or network error — log and retry next cycle
    console.warn(
      `⚠️  ESP sync poll failed (will retry):`,
      (err as Error).message
    );
  } finally {
    isPolling = false;
  }
}

// ─────────────────────────────────────────────────────
// Event Processing
// ─────────────────────────────────────────────────────

/**
 * Process a single identity tap event from the ESP buffer.
 * Returns true if the event was successfully processed (or already processed).
 */
async function processIdentityTap(event: ESPTapEvent): Promise<boolean> {
  // 1. Idempotency check — skip if already processed
  const existing = await getProcessedEvent(event.event_id);
  if (existing) {
    console.log(`⏭️  Event ${event.event_id} already processed — skipping`);
    return true; // Already processed, still count as success for ack
  }

  // 2. Resolve NFC ID → user_id
  const userResult = await getUserIdByNFCId(event.nfc_id);
  if (!userResult) {
    await insertSyncedEvent({
      event_id: event.event_id,
      esp_device_id: extractDeviceId(event.event_id),
      tap_log_id: null,
      status: "failed",
      error_message: `Unknown NFC ID: ${event.nfc_id}`,
      raw_payload: event as unknown as Record<string, unknown>,
    });
    return true; // Don't retry unknown NFC IDs
  }

  const userId = userResult.user_id;

  // 3. Validate hardware (optional — reader may be known). This is the
  // access flow's offline/batch counterpart, so it looks up access_readers,
  // not payment_devices — see supabase_migration_access_readers.sql.
  const credential = await getAccessCredentialByMac(event.mac);
  const readerLabel = credential?.label ?? null;

  // 4. Check user permission
  const user = await getUserById(userId);
  const isApproved = user?.permission?.toLowerCase() === "yes";

  // 5. Generate profile link
  const encryptedId = encrypt(userId);
  // Note: We don't have access to req.protocol/host here, so we use a relative path.
  // The full URL is constructed by the ESP or frontend consumer.
  const profileLink = `/verification-1/${encryptedId}`;

  // 6. Record tap in tap_logs
  const tapLog = await insertTapLog({
    user_id: userId,
    nfc_id: event.nfc_id,
    reader_mac: event.mac,
    reader_id: event.reader_id ?? null,
    reader_label: readerLabel,
    lat: event.lat ?? null,
    lng: event.lng ?? null,
    tapped_at: new Date(event.timestamp * 1000).toISOString(),
    profile_link: profileLink,
    source: event.source === "cache" ? "cache" : "sync",
    approved: isApproved,
  });

  // 7. Record in idempotency registry
  await insertSyncedEvent({
    event_id: event.event_id,
    esp_device_id: extractDeviceId(event.event_id),
    tap_log_id: tapLog.id,
    status: "processed",
    error_message: null,
    raw_payload: event as unknown as Record<string, unknown>,
  });

  console.log(
    `✅ Processed tap: user=${userId}, reader=${event.mac}, approved=${isApproved}`
  );

  return true;
}

// ─────────────────────────────────────────────────────
// ESP HTTP Communication
// ─────────────────────────────────────────────────────

/**
 * Fetch buffered tap events from the Data Storage ESP.
 * GET http://<ESP_IP>/logs
 */
async function fetchLogsFromESP(): Promise<ESPTapEvent[]> {
  const url = `${syncConfig.espStorageUrl}/logs`;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    syncConfig.requestTimeoutMs
  );

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { "Accept": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`ESP responded with status ${response.status}`);
    }

    const data = await response.json() as ESPTapEvent[] | { events: ESPTapEvent[] };

    // Support both array response and { events: [...] } response
    if (Array.isArray(data)) {
      return data;
    }
    if (data && Array.isArray(data.events)) {
      return data.events;
    }

    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Acknowledge processed events to the Data Storage ESP.
 * POST http://<ESP_IP>/ack { ids: ["event_1", "event_2"] }
 */
async function acknowledgeEvents(eventIds: string[]): Promise<void> {
  const url = `${syncConfig.espStorageUrl}/ack`;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    syncConfig.requestTimeoutMs
  );

  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: eventIds }),
    });

    if (!response.ok) {
      console.warn(`⚠️  ESP ack responded with status ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────

/**
 * Extract the device identifier from an event_id.
 * event_id format: "AA:BB:CC:DD:EE:FF-0042" → device = "AA:BB:CC:DD:EE:FF"
 */
function extractDeviceId(eventId: string): string {
  const lastDash = eventId.lastIndexOf("-");
  return lastDash > 0 ? eventId.substring(0, lastDash) : eventId;
}
