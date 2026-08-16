import { supabase } from './supaBaseClient.js';
import { type Request } from "express";
import { randomBytes } from 'crypto';

/**
 * Maps the app's real `profiles` columns onto the response shape existing
 * consumers (ESP firmware, the web profile page) already expect, so the
 * database can use its own real column names (avatar_url, instagram, ...)
 * without every downstream JSON contract needing to change in lockstep.
 */
function serializeProfile(row: {
  full_name?: string | null;
  nickname?: string | null;
  title?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  instagram?: string | null;
  linkedin?: string | null;
  twitter?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp_number?: string | null;
  pitch_deck_url?: string | null;
  resume_url?: string | null;
  portfolio_url?: string | null;
}) {
  return {
    name: row.full_name ?? null,
    nickname: row.nickname ?? null,
    // Wire format stays `role` — that's what frontend/main.js (and
    // presumably the ESP firmware) already reads. Only the DB column
    // renamed to `title`; the JSON key is exactly the stability contract
    // this serializer exists to hold, so it doesn't change too.
    role: row.title ?? null,
    bio: row.bio ?? null,
    image_url: row.avatar_url ?? null,
    instagram_url: row.instagram ?? null,
    linkedin_url: row.linkedin ?? null,
    twitter: row.twitter ?? null,
    // email/phone were never included — the web profile page's mail icon
    // and Contact tab had nothing to render regardless of what a user set.
    email: row.email ?? null,
    phone: row.phone ?? null,
    whatsapp_number: row.whatsapp_number ?? null,
    pitch_deck_url: row.pitch_deck_url ?? null,
    resume_url: row.resume_url ?? null,
    portfolio_url: row.portfolio_url ?? null,
  };
}

/**
 * ✅ Fetch user verification data by user_id
 */
export async function getUserById(userId: string) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("permission, full_name, avatar_url")
    .eq("user_id", userId)
    .single();

  if (error || !profile) {
    console.error("❌ Profile lookup failed:", userId, error?.message);
    return null;
  }

  return {
    name: profile.full_name || "Unnamed User",
    image_url: profile.avatar_url,
    permission: profile.permission,
    timestamp: new Date().toLocaleString()
  };
}

/**
 * ✅ Fetch public profile by cosmic_id (the app's short shareable handle —
 * there is no `username` column in the unified schema).
 */
export async function getPublicProfileData(cosmicId: string) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('full_name, nickname, title, bio, avatar_url, instagram, linkedin, twitter, email, phone, whatsapp_number, pitch_deck_url, resume_url, portfolio_url')
    .eq('cosmic_id', cosmicId)
    .single();

  if (error || !profile) throw new Error('Profile not found');

  return serializeProfile(profile);
}

/**
 * ✅ Fetch public profile by user_id
 */
export async function getPublicProfileDataById(userId: string) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('full_name, nickname, title, bio, avatar_url, instagram, linkedin, twitter, email, phone, whatsapp_number, pitch_deck_url, resume_url, portfolio_url')
    .eq('user_id', userId)
    .single();

  if (error || !profile) throw new Error('Profile not found');

  return serializeProfile(profile);
}

const SHORT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const SHORT_CODE_LENGTH = 6;

function generateShortCode(): string {
  const bytes = randomBytes(SHORT_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    code += SHORT_CODE_ALPHABET[bytes[i]! % SHORT_CODE_ALPHABET.length];
  }
  return code;
}

/**
 * Small NFC tags (e.g. NTAG213, ~137 usable bytes) can't hold the full
 * AES-encrypted /profile/<encryptedId> URL — it regularly runs 140+ bytes
 * once the domain is included. This hands back a short, stable /p/<code>
 * URL instead: one random code per user, reused on repeat calls rather
 * than growing a new row every time a ring gets (re-)written.
 */
export async function getOrCreateShortCode(userId: string): Promise<string> {
  const { data: existing, error: fetchError } = await (supabase as any)
    .from('short_links')
    .select('code')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) throw new Error(`Failed to look up short link: ${fetchError.message}`);
  if (existing?.code) return existing.code;

  // Collisions are astronomically unlikely at this alphabet/length, but
  // retry a few times on the primary-key conflict rather than assume.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateShortCode();
    const { error: insertError } = await (supabase as any)
      .from('short_links')
      .insert({ code, user_id: userId });

    if (!insertError) return code;
    if (insertError.code !== '23505') { // unique_violation
      throw new Error(`Failed to create short link: ${insertError.message}`);
    }
  }

  throw new Error('Could not generate a unique short link. Please try again.');
}

/** Resolves a short /p/<code> link back to the user_id it belongs to. */
export async function getUserIdByShortCode(code: string): Promise<string | null> {
  const { data, error } = await (supabase as any)
    .from('short_links')
    .select('user_id')
    .eq('code', code)
    .maybeSingle();

  if (error || !data) return null;
  return data.user_id as string;
}

/**
 * ✅ Fetch protected data with token validation.
 * protected_profile_data has no app-side consumer today — preserved so this
 * route keeps working, not because the feature is confirmed still wanted.
 */
export async function getProtectedProfileData(cosmicId: string, token: string) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('user_id, full_name, nickname, title, bio, avatar_url, instagram, linkedin, twitter, email, phone, whatsapp_number, pitch_deck_url, resume_url, portfolio_url')
    .eq('cosmic_id', cosmicId)
    .single();

  if (error || !profile) throw new Error('Profile not found');

  const { data: protectedRow, error: protectedError } = await (supabase as any)
    .from('protected_profile_data')
    .select('protected_data, protected_url')
    .eq('user_id', profile.user_id)
    .maybeSingle();

  if (protectedError) throw new Error('Profile not found');

  // Logic check: ensure token matches exactly in the protected_url
  try {
    const url = new URL(protectedRow?.protected_url || "", "http://localhost");
    const expectedToken = url.searchParams.get("token");
    if (!expectedToken || expectedToken !== token) {
      throw new Error('Invalid token');
    }
  } catch {
    throw new Error('Invalid token');
  }

  return {
    ...serializeProfile(profile),
    ...(protectedRow?.protected_data as object || {}),
  };
}

/**
 * ✅ Update token_amount inside protected_profile_data.protected_data JSONB
 */
export async function updateTokenAmount(cosmicId: string, token: string, newTokenAmount: number) {
  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('cosmic_id', cosmicId)
    .single();

  if (fetchError || !profile) throw new Error('Profile not found');

  const { data: protectedRow, error: protectedError } = await (supabase as any)
    .from('protected_profile_data')
    .select('protected_data, protected_url')
    .eq('user_id', profile.user_id)
    .maybeSingle();

  if (protectedError) throw new Error('Profile not found');

  try {
    const url = new URL(protectedRow?.protected_url || "", "http://localhost");
    const expectedToken = url.searchParams.get("token");
    if (!expectedToken || expectedToken !== token) {
      throw new Error('Invalid token');
    }
  } catch {
    throw new Error('Invalid token');
  }

  const updatedProtected = {
    ...(protectedRow?.protected_data as object || {}),
    token_amount: newTokenAmount
  };

  const { error: updateError } = await (supabase as any)
    .from('protected_profile_data')
    .upsert(
      { user_id: profile.user_id, protected_data: updatedProtected },
      { onConflict: 'user_id' }
    );

  if (updateError) throw new Error('Failed to update token amount');

  return { message: 'Token amount updated successfully!' };
}

/**
 * Fetch geofence/verification data for a reader by MAC address.
 * Was a separate `verification_credentials` table; those columns are now
 * folded directly into `payment_devices` (see
 * supabase_migration_org_domain.sql) — one table per physical reader,
 * not two keyed on the same mac_address with a fallback lookup between them.
 */
/**
 * Access-flow twin of what used to be getCredentialByMac against
 * payment_devices — that function had no other callers once this route
 * moved to access_readers, so it was removed rather than kept unused. See
 * supabase_migration_access_readers.sql for why the two tables are separate.
 */
export async function getAccessCredentialByMac(mac_address: string) {
  const { data, error } = await (supabase as any)
    .from("access_readers")
    .select("lat, lng, radius_m, label")
    .eq("mac_address", mac_address)
    .single();

  if (error || !data) {
    console.warn("⚠️ MAC not found in access_readers:", mac_address);
    return null;
  }

  return data;
}

/**
 * Resolve a scanned NFC chip UID to the user who owns that ring.
 * rings.nfc_uid is the hardware UID a reader actually scans — NOT
 * rings.ring_id, which is the printed ID a user types by hand
 * (CSMID-AB12-CD34). Querying the wrong column here is exactly the bug
 * the app/backend schema unification was meant to prevent.
 */
export async function getUserIdByNFCId(nfc_id: string) {
  const { data, error } = await supabase
    .from("rings")
    .select("user_id")
    .eq("nfc_uid", nfc_id)
    .single();

  if (error || !data) {
    console.warn("⚠️ Not a valid NFC-ID", nfc_id);
    return null;
  }

  return data;
}

/**
 * Fetch a ring row by its NFC hardware UID (see getUserIdByNFCId above for
 * why this queries nfc_uid, not ring_id, despite the function name kept
 * for call-site stability).
 */
export async function getRingByRingId(nfc_id: string) {
  const { data, error } = await supabase
    .from("rings")
    .select("*")
    .eq("nfc_uid", nfc_id)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to fetch ring: ${error.message}`
    );
  }

  return data;
}

export async function getWalletByUserId(user_id: string) {
  const { data, error } = await supabase
    .from("wallets")
    .select("balance, user_id")
    .eq("user_id", user_id)
    .single();

  if (error || !data) {
    console.warn("⚠️ Not a valid MAC-Address", user_id);
    return null;
  }

  return data;
}

export async function overrideUser(userId: string) {
  const user = await getUserById(userId);

  if (!user) {
    throw new Error("User doesn't exist");
  }

  if (user.permission?.toLowerCase() !== "yes") {
    return {
      message: "User didn't have access from the start!"
    };
  }

  const { error } = await supabase
    .from('profiles')
    .update({ permission: 'no' })
    .eq('user_id', userId);

  if (error) {
    throw new Error("Failed to revoke access");
  }

  return {
    message: "Access revoked successfully!"
  };
}


export async function getOrganizationById(organizationId: string) {
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .single();

  if (error) {
    throw new Error(
      `Failed to fetch organization: ${error.message}`
    );
  }

  return data;
}


export async function getDeviceByMacAddress(
  macAddress: string
) {
  const { data, error } = await supabase
    .from("payment_devices")
    .select("*")
    .eq("mac_address", macAddress)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to fetch device: ${error.message}`
    );
  }

  return data;
}

/**
 * Access-flow twin of getDeviceByMacAddress — queries access_readers
 * instead of payment_devices. See supabase_migration_access_readers.sql.
 */
export async function getAccessReaderByMac(
  macAddress: string
) {
  const { data, error } = await (supabase as any)
    .from("access_readers")
    .select("*")
    .eq("mac_address", macAddress)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to fetch access reader: ${error.message}`
    );
  }

  return data;
}


/**
 * ringId here is the rings.id UUID (reader_access.ring_id is a real FK to
 * rings, not the loose text column it used to be) — callers must resolve
 * the NFC UID to a ring row (getRingByRingId) before calling this.
 */
export async function getReaderAccess(
  ringId: string,
  readerId: string
) {
  const { data, error } = await supabase
    .from("reader_access")
    .select("*")
    .eq("ring_id", ringId)
    .eq("reader_id", readerId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to fetch reader access: ${error.message}`
    );
  }

  return data;
}

/**
 * Access-flow twin of getReaderAccess — checks access_reader_grants
 * (ring ↔ access_readers) instead of reader_access (ring ↔ payment_devices).
 */
export async function getAccessReaderAccess(
  ringId: string,
  readerId: string
) {
  const { data, error } = await (supabase as any)
    .from("access_reader_grants")
    .select("*")
    .eq("ring_id", ringId)
    .eq("reader_id", readerId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to fetch access reader grant: ${error.message}`
    );
  }

  return data;
}


/**
 * Look up the workshop slot currently assigned to a reader (payment_devices
 * row), if any. workshop_slots / reader_workshop_assignment are brand new
 * tables not yet in the generated Supabase types — same stale-types gap as
 * device_registry/tap_logs elsewhere in this file — so cast to any rather
 * than blocking on a type regen.
 */
export async function getActiveWorkshopAssignmentForReader(readerId: string) {
  const { data, error } = await (supabase as any)
    .from("reader_workshop_assignment")
    .select("workshop_slot_id, workshop_slots(event_slug, slot_number, points)")
    .eq("reader_id", readerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch workshop assignment: ${error.message}`);
  }

  if (!data || !data.workshop_slots) {
    return null;
  }

  return {
    workshop_slot_id: data.workshop_slot_id as string,
    event_slug: data.workshop_slots.event_slug as string,
    slot_number: data.workshop_slots.slot_number as number,
    points: data.workshop_slots.points as number,
  };
}

/**
 * Check whether a user is registered for a given event. event_registrations
 * already exists in the schema but isn't in the generated Supabase types
 * either — same stale-types gap as elsewhere in this file — so cast to any
 * rather than blocking on a type regen. Returns a boolean rather than the
 * raw row so callers don't need to know its shape.
 */
export async function isUserRegisteredForEvent(userId: string, eventSlug: string): Promise<boolean> {
  const { data, error } = await (supabase as any)
    .from("event_registrations")
    .select("id")
    .eq("user_id", userId)
    .eq("event_slug", eventSlug)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  return true;
}

export async function getTransactionsByOrganizationId(
  organizationId: string
) {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", {
      ascending: false
    });

  if (error) {
    throw new Error(
      `Failed to fetch transactions: ${error.message}`
    );
  }

  return data;
}


// Admin functions
type OrgRole = "user" | "minor_admin" | "admin";

type MembershipRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
};

export type UserRow = {
  user_id: string;
  cosmic_id: string | null;
  email: string | null;
  app_role: "user" | "admin" | "super_admin";
};


export function isSuperAdmin(user: UserRow | null): boolean {
  if (!user) return false;
  return user.app_role === "super_admin";
}


export async function getCurrentUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.substring(7);
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return user.id;
  } catch {
    return null;
  }
}


export async function getCurrentUserRow(userId: string): Promise<UserRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, cosmic_id, email, app_role")
    .eq("user_id", userId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch current user: ${error.message}`);
  }

  return data as UserRow | null;
}

async function getMembership(
  userId: string,
  organizationId: string
): Promise<MembershipRow | null> {
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("*")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch membership: ${error.message}`);
  }

  return data as MembershipRow | null;
}

export async function requireOrgAccess(
  req: Request,
  organizationId: string,
  allowedRoles: OrgRole[] = ["minor_admin", "admin"]
): Promise<{
  actingUserId: string;
  actingUser: UserRow;
  membership: MembershipRow | null;
  superAdmin: boolean;
}> {
  const actingUserId = await getCurrentUserId(req);
  if (!actingUserId) {
    throw new Error("Unauthorized");
  }

  const actingUser = await getCurrentUserRow(actingUserId);
  if (!actingUser) {
    throw new Error("Unauthorized");
  }

  const superAdmin = isSuperAdmin(actingUser);
  if (superAdmin) {
    return {
      actingUserId,
      actingUser,
      membership: null,
      superAdmin: true,
    };
  }

  const membership = await getMembership(actingUserId, organizationId);
  if (!membership || !allowedRoles.includes(membership.role)) {
    throw new Error("Forbidden");
  }

  return {
    actingUserId,
    actingUser,
    membership,
    superAdmin: false,
  };
}


// ─────────────────────────────────────────────────────
// ESP Sync: Tap Logs & Idempotency
// ─────────────────────────────────────────────────────

export interface TapLogEntry {
  user_id: string;
  nfc_id: string;
  reader_mac: string;
  reader_id?: string | null;
  reader_label?: string | null;
  lat?: number | null;
  lng?: number | null;
  tapped_at: string;          // ISO 8601 timestamp
  profile_link?: string | null;
  source: "realtime" | "sync" | "cache";
  approved?: boolean;
}

export interface SyncedESPEvent {
  event_id: string;
  esp_device_id: string;
  tap_log_id?: string | null;
  status: "processed" | "failed" | "skipped";
  error_message?: string | null;
  raw_payload: Record<string, unknown>;
}

/**
 * Insert a tap log entry for conference tracking.
 * Returns the created tap_log id.
 *
 * Note: Uses `as any` cast because tap_logs is not yet in the
 * auto-generated Supabase types. Run `npm run update-types` after
 * creating the table to get full type safety.
 */
export async function insertTapLog(tapLog: TapLogEntry) {
  const { data, error } = await (supabase as any)
    .from("tap_logs")
    .insert({
      user_id: tapLog.user_id,
      nfc_uid: tapLog.nfc_id,
      reader_mac: tapLog.reader_mac,
      reader_id: tapLog.reader_id ?? null,
      reader_label: tapLog.reader_label ?? null,
      lat: tapLog.lat ?? null,
      lng: tapLog.lng ?? null,
      tapped_at: tapLog.tapped_at,
      profile_link: tapLog.profile_link ?? null,
      source: tapLog.source,
      approved: tapLog.approved ?? true,
    })
    .select("id")
    .single();

  if (error) {
    console.error("❌ Failed to insert tap_log:", error.message);
    throw new Error(`Failed to insert tap_log: ${error.message}`);
  }

  return data as { id: string };
}

/**
 * Check if an ESP event was already processed (idempotency check).
 * Returns the synced event row if found, null otherwise.
 */
export async function getProcessedEvent(eventId: string) {
  const { data, error } = await (supabase as any)
    .from("synced_esp_events")
    .select("id, event_id, status")
    .eq("event_id", eventId)
    .maybeSingle();

  if (error) {
    console.error("❌ Idempotency check failed:", error.message);
    return null;
  }

  return data as { id: string; event_id: string; status: string } | null;
}

/**
 * Record a synced ESP event in the idempotency registry.
 */
export async function insertSyncedEvent(event: SyncedESPEvent) {
  const { error } = await (supabase as any)
    .from("synced_esp_events")
    .insert({
      event_id: event.event_id,
      esp_device_id: event.esp_device_id,
      tap_log_id: event.tap_log_id ?? null,
      status: event.status,
      error_message: event.error_message ?? null,
      raw_payload: event.raw_payload,
    });

  if (error) {
    console.error("❌ Failed to insert synced_esp_event:", error.message);
    throw new Error(`Failed to insert synced_esp_event: ${error.message}`);
  }
}

/**
 * Get tap history for a specific user (conference attendance).
 */
export async function getTapLogsByUser(userId: string) {
  const { data, error } = await (supabase as any)
    .from("tap_logs")
    .select("*")
    .eq("user_id", userId)
    .order("tapped_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch tap_logs: ${error.message}`);
  }

  return data;
}

/**
 * Get all approved NFC ring UIDs for a specific access reader. Used by ESP
 * on boot to warm its local approved-user cache. Reads access_reader_grants
 * / access_readers — the payment_devices/reader_access version this
 * replaced had no other callers once /cache-sync moved here, so it was
 * removed rather than kept unused (see supabase_migration_access_readers.sql).
 */
export async function getApprovedRingsForAccessReader(readerId: string) {
  const { data: accessRows, error: accessError } = await (supabase as any)
    .from("access_reader_grants")
    .select("ring_id")
    .eq("reader_id", readerId);

  if (accessError || !accessRows || accessRows.length === 0) {
    return [];
  }

  const ringUuids = accessRows.map((r: { ring_id: string }) => r.ring_id);

  const { data: rings, error: ringsError } = await supabase
    .from("rings")
    .select("nfc_uid, user_id")
    .in("id", ringUuids);

  if (ringsError || !rings) {
    return [];
  }

  const userIds = rings.map((r) => r.user_id);
  const { data: users, error: usersError } = await supabase
    .from("profiles")
    .select("user_id, permission")
    .in("user_id", userIds)
    .eq("permission", "yes");

  if (usersError || !users) {
    return [];
  }

  const approvedUserIds = new Set(users.map((u) => u.user_id));

  return rings
    .filter((r) => approvedUserIds.has(r.user_id) && r.nfc_uid)
    .map((r) => ({
      nfc_id: r.nfc_uid,
      user_id: r.user_id,
    }));
}
