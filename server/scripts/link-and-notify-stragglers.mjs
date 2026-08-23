#!/usr/bin/env node

/**
 * Catches accounts that signed up after the original batch snapshot but
 * before the auto-provision endpoint went live — same treatment as the
 * batch: link a free device directly into `rings`, then send the
 * "ring is ready" notification. Safe to re-run: skips anyone who already
 * has a ring, and the log guards against emailing the same account twice.
 */

import 'dotenv/config';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const DEVICE_EMAIL_FROM = process.env.DEVICE_EMAIL_FROM || 'Cosmic Attire <noreply@cosmicattire.in>';
const DEFAULT_ORG = 'COSMIC WEEK';

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) throw new Error('Missing SUPABASE_URL / SUPABASE_SECRET_KEY in .env');
if (!RESEND_API_KEY) throw new Error('Missing RESEND_API_KEY in .env');

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);
const resend = new Resend(RESEND_API_KEY);

const logPath = new URL('./link-and-notify-stragglers.log', import.meta.url);
const logText = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
const alreadyNotified = new Set([...logText.matchAll(/^\S+ SENT \S+ (\S+)$/gm)].map((m) => m[1]));
const logLine = (line) => fs.appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`);

const { data: profiles, error: profErr } = await supabase
  .from('profiles')
  .select('user_id, email, full_name')
  .not('email', 'is', null);
if (profErr) throw profErr;

const { data: ringRows, error: ringErr } = await supabase.from('rings').select('user_id, ring_id');
if (ringErr) throw ringErr;
const usersWithRing = new Set(ringRows.map((r) => r.user_id));
const claimedDeviceIds = new Set(ringRows.map((r) => r.ring_id));

const stragglers = profiles.filter((p) => !usersWithRing.has(p.user_id) && !alreadyNotified.has(p.email));
console.log(`${stragglers.length} accounts need linking + notification.`);

const { data: registryRows, error: registryErr } = await supabase
  .from('device_registry')
  .select('device_id, org_name');
if (registryErr) throw registryErr;

let freePool = registryRows.filter(
  (r) => !claimedDeviceIds.has(r.device_id) && (r.org_name || '').trim() === DEFAULT_ORG
);
console.log(`${freePool.length} free device IDs available in "${DEFAULT_ORG}".`);

let linked = 0;
let failed = 0;

for (const person of stragglers) {
  try {
    if (freePool.length === 0) throw new Error('No free device IDs left.');
    const device = freePool.shift();

    const { error: insertErr } = await supabase
      .from('rings')
      .upsert(
        { user_id: person.user_id, ring_id: device.device_id, nfc_uid: device.device_id, status: 'active', org_name: DEFAULT_ORG },
        { onConflict: 'user_id,ring_id' }
      );
    if (insertErr) throw new Error(`Link failed: ${insertErr.message}`);

    const { error: emailError } = await resend.emails.send({
      from: DEVICE_EMAIL_FROM,
      to: person.email,
      subject: 'Your Cosmic ring is ready',
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #DC2626;">Your Cosmic ring is ready</h2>
          <p>Your account is already linked to a Cosmic device — nothing to type in, you're all set:</p>
          <p style="font-size: 24px; font-weight: 800; letter-spacing: 2px; background: #f5f5f5; padding: 16px; border-radius: 8px; text-align: center;">${device.device_id}</p>
          <p style="color: #666; font-size: 13px;">Organization: ${DEFAULT_ORG}</p>
        </div>
      `,
    });
    if (emailError) throw new Error(`Resend failed (device already linked): ${emailError.message}`);

    console.log(`OK   ${device.device_id} -> ${person.email}`);
    logLine(`SENT ${device.device_id} ${person.email}`);
    linked++;
  } catch (err) {
    console.error(`FAIL ${person.email}: ${err.message}`);
    logLine(`FAIL - ${person.email} ${err.message}`);
    failed++;
  }
  await new Promise((r) => setTimeout(r, 600));
}

console.log(`\nDone. Linked+notified: ${linked}, Failed: ${failed}.`);
