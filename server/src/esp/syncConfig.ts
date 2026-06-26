import { env } from "../config.js";

export const syncConfig = {
  /** Base URL of the Data Storage ESP (e.g. "http://192.168.1.100") */
  espStorageUrl: (env as any).ESP_STORAGE_URL as string | undefined,

  /** Polling interval in milliseconds (default: 3500ms = 3.5 seconds) */
  pollIntervalMs: ((env as any).ESP_POLL_INTERVAL_MS as number) ?? 3500,

  /** Whether the sync service is enabled */
  enabled: ((env as any).ESP_POLL_ENABLED as string) === "true",

  /** Max approved-user cache entries the ESP should maintain */
  maxCacheSize: 200,

  /** Cache TTL in seconds (default: 2 hours) */
  cacheTtlSeconds: 7200,

  /** HTTP request timeout when communicating with ESP (ms) */
  requestTimeoutMs: 5000,
};
