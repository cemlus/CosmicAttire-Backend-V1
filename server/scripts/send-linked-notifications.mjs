#!/usr/bin/env node

/**
 * Sends the "your ring is ready" notification for rows in
 * device-assignment-preview.csv that haven't been emailed yet (the first
 * 33 already got the old "type this in" email via send-device-assignments.mjs
 * — skip those, don't send a device ID twice). Everyone in this CSV is
 * already linked in `rings` (link-batch-devices.mjs did that), so this is
 * informational only — no device_registry/rings writes here.
 *
 * Usage:
 *   node scripts/send-linked-notifications.mjs --limit 10   # test batch
 *   node scripts/send-linked-notifications.mjs              # all remaining
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
  const args = { limit: Infinity };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit') args.limit = Number(argv[++i]);
  }
  return args;
}

function parseCsv(text) {
  const [, ...lines] = text.trim().split('\n');
  return lines.map((line) => {
    const m = line.match(/^([^,]*),([^,]*),([^,]*),"((?:[^"]|"")*)"$/);
    if (!m) throw new Error(`Could not parse CSV line: ${line}`);
    const [, device_id, org_name, email] = m;
    return { device_id, org_name, email };
  });
}

const logPath = new URL('./send-device-assignments.log', import.meta.url);
const logText = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
const alreadySent = new Set(
  [...logText.matchAll(/^\S+ SENT (\S+) (\S+)$/gm)].map((m) => m[1]) // device_id already emailed
);

const { limit } = parseArgs(process.argv.slice(2));
const rows = parseCsv(fs.readFileSync(new URL('./device-assignment-preview.csv', import.meta.url), 'utf8'));
const pending = rows.filter((r) => !alreadySent.has(r.device_id)).slice(0, limit);

console.log(`${rows.length} total rows, ${alreadySent.size} already emailed, sending to ${pending.length} now.`);

const logLine = (line) => fs.appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`);

let sent = 0;
let failed = 0;

for (const row of pending) {
  try {
    const { error: emailError } = await resend.emails.send({
      from: DEVICE_EMAIL_FROM,
      to: row.email,
      subject: 'Your Cosmic ring is ready',
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #DC2626;">Your Cosmic ring is ready</h2>
          <p>Your account is already linked to a Cosmic device — nothing to type in, you're all set:</p>
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
  await new Promise((r) => setTimeout(r, 600));
}

console.log(`\nDone. Sent: ${sent}, Failed: ${failed}.`);
