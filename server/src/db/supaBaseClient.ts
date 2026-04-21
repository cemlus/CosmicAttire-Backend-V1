// supabaseClient.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase.js';
import { env } from '../config.js';

const supabaseUrl = env.SUPABASE_URL;
const supabasePublishibleKey = env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishibleKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabasePublishibleKey);