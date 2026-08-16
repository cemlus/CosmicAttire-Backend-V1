import 'dotenv/config'
import { z } from 'zod';

const envSchema = z.object({
    PORT: z.coerce.number().default(8080),
    SUPABASE_URL: z.string().min(1),
    SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    SUPABASE_SECRET_KEY: z.string().min(1),
    PROFILE_ENCRYPTION_KEY: z.string().min(1),
    PRIVATE_PEM_B64: z.string().min(1),
    VERIFY_PRIVATE_PEM_B64: z.string().min(1),
    ESP_STORAGE_URL: z.string().url().optional(),
    ESP_POLL_INTERVAL_MS: z.coerce.number().default(3500),
    ESP_POLL_ENABLED: z.string().default("false"),
    // Comma-separated list of allowed browser origins (dashboard, app web build).
    // ESP32 devices and server-to-server calls don't send an Origin header, so
    // they are unaffected by this — it only gates browser-based CORS requests.
    ALLOWED_ORIGINS: z.string().default("http://localhost:3000,http://localhost:5173,http://localhost:8081"),
    // Hostname used when building the /networking-url and /short-url response
    // links (e.g. a short custom domain for NFC tags), overriding whatever
    // host the generating request came in on. Everything else — WS, ESP
    // endpoints, ring-password — keeps using the request's actual host
    // regardless of this var. Unset = fall back to req.get("host") (old behavior).
    PUBLIC_LINK_DOMAIN: z.string().optional(),
    // Shared secret a local dev/relay server must present (as ?token=) to open
    // the inbound WebSocket at /api/ws/local. Unset = inbound WS disabled.
    WS_SHARED_SECRET: z.string().optional(),
    // Outbound: this server dialing out to a local relay server as a WS client
    // (e.g. one exposed via ngrok during development). Off by default.
    LOCAL_WS_URL: z.string().url().optional(),
    LOCAL_WS_ENABLED: z.string().default("false"),
})

export const env = envSchema.parse(process.env);