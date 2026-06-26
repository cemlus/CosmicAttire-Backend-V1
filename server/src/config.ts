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
})

export const env = envSchema.parse(process.env);