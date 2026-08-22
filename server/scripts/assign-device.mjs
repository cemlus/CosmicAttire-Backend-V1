#!/usr/bin/env node

/**
 * One-shot CLI for POST /api/admin/assign-device — registers a device ID
 * (random CSMID-XXXX-XXXX if you don't pass one) and emails it to a user
 * who doesn't have a physical ring yet.
 *
 * Needs a real super_admin Supabase access token (same one used in the
 * web tool / curl examples). Those expire in about an hour, so grab a
 * fresh one from your logged-in session each time you run this.
 *
 * Usage:
 *   node scripts/assign-device.mjs --token <token> --email <recipient> --org "<org name>" [--device-id CSMID-XXXX-XXXX]
 */

const BACKEND_URL = process.env.BACKEND_URL || 'https://p.cosmicattire.online';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--token') args.token = argv[++i];
    else if (a === '--email') args.email = argv[++i];
    else if (a === '--org') args.org = argv[++i];
    else if (a === '--device-id') args.deviceId = argv[++i];
  }
  return args;
}

const { token, email, org, deviceId } = parseArgs(process.argv.slice(2));

if (!token || !email || !org) {
  console.error(
    'Usage: node scripts/assign-device.mjs --token <supabase_access_token> --email <recipient> --org "<org name>" [--device-id CSMID-XXXX-XXXX]'
  );
  process.exit(1);
}

const res = await fetch(`${BACKEND_URL}/api/admin/assign-device`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify(deviceId ? { email, orgName: org, deviceId } : { email, orgName: org }),
});

const data = await res.json().catch(() => null);

if (!res.ok) {
  console.error(`Failed (${res.status}): ${data?.error || res.statusText}`);
  process.exit(1);
}

console.log(`Registered ${data.deviceId} and emailed it to ${data.email}`);
