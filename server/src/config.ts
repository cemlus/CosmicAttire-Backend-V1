import 'dotenv/config'
import { z } from 'zod';

const envSchema = z.object({
    PORT: z.coerce.number().default(8080),
    SUPABASE_URL: z.string().min(1),
    SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    SUPABASE_SECRET_KEY: z.string().min(1),
    PROFILE_ENCRYPTION_KEY: z.string().min(1),
})

export const env = envSchema.parse(process.env);