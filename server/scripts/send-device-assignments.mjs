#!/usr/bin/env node

/**
 * Sends the device_id -> email pairing from device-assignment-preview.csv
 * (built by preview-device-assignment.mjs). Registers each device_id in
 * device_registry (upsert, same as /api/admin/assign-device) and emails it
 * via Resend. Same logic as the live route, run directly against the DB
 * since this needs to process a batch, not one call at a time.
 *
 * Usage:
 *   node scripts/send-device-assignments.mjs --limit 5        # first N rows only
 *   node scripts/send-device-assignments.mjs                  # all rows
 *   node scripts/send-device-assignments.mjs --start 5 --limit 5   # rows 5-9
 *
 * Logs each result to send-device-assignments.log (appended) so a partial
 * run can be resumed without guessing what already went out — check the
 * log for device_ids already marked "sent" before re-running.
 */

import 'dotenv/config';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const DEVICE_EMAIL_FROM = process.env.DEVICE_EMAIL_FROM || 'Cosmic Attire <noreply@cosmicattire.in>';

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) throw new Error('Missing SUPABASE_URL / SUPABASE_SECRET_KEY in .env');
if (!RESEND_API_KEY) throw new Error('Missing RESEND_API_KEY in .env');

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);
const resend = new Resend(RESEND_API_KEY);

function parseArgs(argv) {
  const args = { start: 0, limit: Infinity };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--start') args.start = Number(argv[++i]);
    else if (argv[i] === '--limit') args.limit = Number(argv[++i]);
  }
  return args;
}

function parseCsv(text) {
  const [, ...lines] = text.trim().split('\n'); // drop header
  return lines.map((line) => {
    const m = line.match(/^([^,]*),([^,]*),([^,]*),"((?:[^"]|"")*)"$/);
    if (!m) throw new Error(`Could not parse CSV line: ${line}`);
    const [, device_id, org_name, email, full_name] = m;
    return { device_id, org_name, email, full_name: full_name.replace(/""/g, '"') };
  });
}

const { start, limit } = parseArgs(process.argv.slice(2));
const csvPath = new URL('./device-assignment-preview.csv', import.meta.url);
const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
const batch = rows.slice(start, start + limit);

console.log(`Sending ${batch.length} of ${rows.length} total rows (start=${start}).`);

const logPath = new URL('./send-device-assignments.log', import.meta.url);
const logLine = (line) => fs.appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`);

let sent = 0;
let failed = 0;

for (const row of batch) {
  try {
    const { error: dbError } = await supabase
      .from('device_registry')
      .upsert({ device_id: row.device_id, org_name: row.org_name }, { onConflict: 'device_id' });
    if (dbError) throw new Error(`DB upsert failed: ${dbError.message}`);

    const { error: emailError } = await resend.emails.send({
      from: DEVICE_EMAIL_FROM,
      to: row.email,
      subject: 'Your Cosmic Device ID',
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #DC2626;">Your Cosmic Device ID</h2>
          <p>Use this ID to link your Cosmic ring in the app — go to <strong>Enter your Cosmic Device ID</strong> and type it in exactly as shown:</p>
          <p style="font-size: 24px; font-weight: 800; letter-spacing: 2px; background: #f5f5f5; padding: 16px; border-radius: 8px; text-align: center;">${row.device_id}</p>
          <p style="color: #666; font-size: 13px;">Organization: ${row.org_name}</p>
        </div>
      `,
    });
    if (emailError) throw new Error(`Resend failed: ${emailError.message}`);

    sent++;
    console.log(`OK   ${row.device_id} -> ${row.email}`);
    logLine(`SENT ${row.device_id} ${row.email}`);
  } catch (err) {
    failed++;
    console.error(`FAIL ${row.device_id} -> ${row.email}: ${err.message}`);
    logLine(`FAIL ${row.device_id} ${row.email} ${err.message}`);
  }
  // Small pause between sends to be gentle on Resend's rate limit.
  await new Promise((r) => setTimeout(r, 600));
}

console.log(`\nDone. Sent: ${sent}, Failed: ${failed}.`);
