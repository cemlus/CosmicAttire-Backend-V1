#!/usr/bin/env node

/**
 * Read-only preview: pairs unclaimed device_registry rows with accounts
 * that have signed up but have no row in `rings` yet, and prints the
 * proposed device_id -> email mapping. Sends nothing. Run this, review
 * the output, THEN use the confirmed pairing to actually send emails.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

const { data: registryRows, error: registryErr } = await supabase
  .from('device_registry')
  .select('device_id, org_name, org_id');
if (registryErr) throw registryErr;

const { data: ringRows, error: ringErr } = await supabase
  .from('rings')
  .select('ring_id, user_id');
if (ringErr) throw ringErr;

const claimedDeviceIds = new Set(ringRows.map((r) => r.ring_id));
const usersWithRing = new Set(ringRows.map((r) => r.user_id));

const unclaimed = registryRows.filter((r) => !claimedDeviceIds.has(r.device_id));

// organization_memberships is empty in this project (never adopted — see
// NFCCardSetup.js's comment on org-based locking being disabled), so there's
// no reliable way to know which org each user actually belongs to. Rather
// than guess, only auto-pair within the dominant org bucket and leave the
// rest for manual handling.
const orgCounts = {};
for (const r of unclaimed) { const k = (r.org_name || '').trim(); orgCounts[k] = (orgCounts[k] || 0) + 1; }
console.log('Unclaimed device IDs by org_name:', orgCounts);

const DOMINANT_ORG = Object.entries(orgCounts).sort((a, b) => b[1] - a[1])[0][0];
const pairablePool = unclaimed.filter((r) => (r.org_name || '').trim() === DOMINANT_ORG);
const setAsideDevices = unclaimed.filter((r) => (r.org_name || '').trim() !== DOMINANT_ORG);

const { data: profileRows, error: profileErr } = await supabase
  .from('profiles')
  .select('user_id, email, full_name')
  .not('email', 'is', null);
if (profileErr) throw profileErr;

const usersNeedingDevice = profileRows.filter((p) => !usersWithRing.has(p.user_id));

console.log(`\nPairing within org "${DOMINANT_ORG}" only (${pairablePool.length} devices available).`);
console.log(`Accounts with no ring linked: ${usersNeedingDevice.length}`);
if (setAsideDevices.length) {
  console.log(`Set aside (different org, not auto-paired):`, setAsideDevices.map((d) => `${d.device_id} (${d.org_name.trim()})`));
}
console.log('');

const pairCount = Math.min(pairablePool.length, usersNeedingDevice.length);
const pairs = [];
for (let i = 0; i < pairCount; i++) {
  pairs.push({
    device_id: pairablePool[i].device_id,
    org_name: pairablePool[i].org_name.trim(),
    email: usersNeedingDevice[i].email,
    full_name: usersNeedingDevice[i].full_name,
  });
}

console.log('Proposed pairing:');
console.table(pairs);

if (pairablePool.length > usersNeedingDevice.length) {
  console.log(`\n${pairablePool.length - usersNeedingDevice.length} unclaimed "${DOMINANT_ORG}" device ID(s) left over with no account to pair to.`);
}
if (usersNeedingDevice.length > pairablePool.length) {
  console.log(`\n${usersNeedingDevice.length - pairablePool.length} account(s) with no ring left over with no device ID to pair to.`);
  console.table(usersNeedingDevice.slice(pairCount));
}

const fs = await import('fs');
fs.writeFileSync(
  new URL('./device-assignment-preview.csv', import.meta.url),
  'device_id,org_name,email,full_name\n' + pairs.map((p) => `${p.device_id},${p.org_name},${p.email},"${(p.full_name || '').replace(/"/g, '""')}"`).join('\n')
);
console.log('\nWrote full pairing to scripts/device-assignment-preview.csv for review.');
