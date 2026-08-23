#!/usr/bin/env node

/**
 * One-time reconciliation: the batch job (send-device-assignments.mjs) only
 * wrote device_registry + sent an email — never linked `rings`. That left
 * these 179 device IDs looking "unclaimed" to the DB, so the new
 * auto-provision endpoint could hand one of them to a different person.
 * This links them directly, matching the "auto-link, no typing" design —
 * anyone who already got the old "type this in" email doesn't need to do
 * anything; it's already linked by the time they open the app.
 *
 * Safe to re-run: skips anyone who already has a ring linked.
 */

import 'dotenv/config';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

function parseCsv(text) {
  const [, ...lines] = text.trim().split('\n');
  return lines.map((line) => {
    const m = line.match(/^([^,]*),([^,]*),([^,]*),"((?:[^"]|"")*)"$/);
    if (!m) throw new Error(`Could not parse CSV line: ${line}`);
    const [, device_id, org_name, email] = m;
    return { device_id, org_name, email };
  });
}

const rows = parseCsv(fs.readFileSync(new URL('./device-assignment-preview.csv', import.meta.url), 'utf8'));
console.log(`Reconciling ${rows.length} rows.`);

let linked = 0;
let skipped = 0;
let failed = 0;

for (const row of rows) {
  try {
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('email', row.email)
      .maybeSingle();
    if (profileErr) throw new Error(`Profile lookup failed: ${profileErr.message}`);
    if (!profile) {
      console.warn(`SKIP  ${row.email}: no profile found (account may have been deleted).`);
      skipped++;
      continue;
    }

    const { data: existingRing } = await supabase
      .from('rings')
      .select('ring_id')
      .eq('user_id', profile.user_id)
      .maybeSingle();
    if (existingRing) {
      console.log(`SKIP  ${row.email}: already has a ring linked (${existingRing.ring_id}).`);
      skipped++;
      continue;
    }

    const { error: insertErr } = await supabase
      .from('rings')
      .upsert(
        { user_id: profile.user_id, ring_id: row.device_id, nfc_uid: row.device_id, status: 'active', org_name: row.org_name },
        { onConflict: 'user_id,ring_id' }
      );
    if (insertErr) throw new Error(`Link failed: ${insertErr.message}`);

    console.log(`OK    ${row.device_id} -> ${row.email}`);
    linked++;
  } catch (err) {
    console.error(`FAIL  ${row.email}: ${err.message}`);
    failed++;
  }
}

console.log(`\nDone. Linked: ${linked}, Skipped (already linked/no profile): ${skipped}, Failed: ${failed}.`);
