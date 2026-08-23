#!/usr/bin/env node

/**
 * Retry-only companion to link-and-notify-stragglers.mjs — for accounts
 * that got their device linked but hit Resend's daily quota before the
 * email went out. Finds anyone in link-and-notify-stragglers.log marked
 * FAIL with no later SENT line for the same email, and just resends the
 * notification (no re-linking — their ring is already set).
 */

import 'dotenv/config';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const DEVICE_EMAIL_FROM = process.env.DEVICE_EMAIL_FROM || 'Cosmic Attire <noreply@cosmicattire.in>';

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);
const resend = new Resend(RESEND_API_KEY);

const logPath = new URL('./link-and-notify-stragglers.log', import.meta.url);
const logText = fs.readFileSync(logPath, 'utf8');

const sent = new Set();
const failedEmails = new Set();
for (const line of logText.trim().split('\n')) {
  const sentMatch = line.match(/^\S+ SENT \S+ (\S+)$/);
  if (sentMatch) sent.add(sentMatch[1]);
  const failMatch = line.match(/^\S+ FAIL - (\S+) /);
  if (failMatch) failedEmails.add(failMatch[1]);
}
const toRetry = [...failedEmails].filter((e) => !sent.has(e));
console.log(`${toRetry.length} emails to retry.`);

const logLine = (line) => fs.appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`);

let ok = 0;
let failed = 0;

for (const email of toRetry) {
  try {
    const { data: profile } = await supabase.from('profiles').select('user_id').eq('email', email).maybeSingle();
    if (!profile) throw new Error('No profile found.');
    const { data: ring } = await supabase.from('rings').select('ring_id, org_name').eq('user_id', profile.user_id).maybeSingle();
    if (!ring) throw new Error('No ring linked — was expected to already be linked.');

    const { error: emailError } = await resend.emails.send({
      from: DEVICE_EMAIL_FROM,
      to: email,
      subject: 'Your Cosmic ring is ready',
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #DC2626;">Your Cosmic ring is ready</h2>
          <p>Your account is already linked to a Cosmic device — nothing to type in, you're all set:</p>
          <p style="font-size: 24px; font-weight: 800; letter-spacing: 2px; background: #f5f5f5; padding: 16px; border-radius: 8px; text-align: center;">${ring.ring_id}</p>
          <p style="color: #666; font-size: 13px;">Organization: ${(ring.org_name || '').trim()}</p>
        </div>
      `,
    });
    if (emailError) throw new Error(emailError.message);

    console.log(`OK   ${ring.ring_id} -> ${email}`);
    logLine(`SENT ${ring.ring_id} ${email}`);
    ok++;
  } catch (err) {
    console.error(`FAIL ${email}: ${err.message}`);
    logLine(`FAIL - ${email} ${err.message}`);
    failed++;
  }
  await new Promise((r) => setTimeout(r, 600));
}

console.log(`\nDone. Sent: ${ok}, Failed: ${failed}.`);
