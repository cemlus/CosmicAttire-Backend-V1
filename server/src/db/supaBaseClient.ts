import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase.js';
import { env } from '../config.js';

const supabaseUrl = env.SUPABASE_URL;
const supabaseSecretKey = env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseSecretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
