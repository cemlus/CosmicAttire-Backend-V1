import path from 'path';
import { supabase } from './supaBaseClient.js';
import { type Request } from "express";

/**
 * Helper: Extract name from the jsonb public_data field
 */
const getNameFromPublicData = (data: any): string => {
  return data && typeof data === 'object' && 'name' in data
    ? String(data.name).trim()
    : "Unnamed User";
};

/**
 * ✅ Fetch user verification data by user_id
 */
export async function getUserById(userId: string) {
  const { data: profile, error } = await supabase
    .from("user_profiles") // Fixed table name
    .select("permission, public_data, image_url")
    .eq("user_id", userId)
    .single();

  if (error || !profile) {
    console.error("❌ Profile lookup failed:", userId, error?.message);
    return null;
  }

  return {
    name: getNameFromPublicData(profile.public_data),
    image_url: profile.image_url,
    permission: profile.permission,
    timestamp: new Date().toLocaleString()
  };
}

/**
 * ✅ Fetch profile by username (Directly, no redundant lookup)
 */
export async function getPublicProfileData(username: string) {
  const { data: profile, error } = await supabase
    .from('user_profiles') // Fixed table name
    .select(`
      public_data,
      image_url,
      instagram_url,
      whatsapp_number,
      linkedin_url,
      pitch_deck_url
    `)
    .eq('username', username)
    .single();

  if (error || !profile) throw new Error('Profile not found');

  return {
    ...(profile.public_data as object || {}),
    image_url: profile.image_url,
    instagram_url: profile.instagram_url,
    whatsapp_number: profile.whatsapp_number,
    linkedin_url: profile.linkedin_url,
    pitch_deck_url: profile.pitch_deck_url
  };
}

/**
 * ✅ Fetch profile by username (Directly, no redundant lookup)
 */
export async function getPublicProfileDataById(userId: string) {
  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select(`
      public_data,
      image_url,
      instagram_url,
      whatsapp_number,
      linkedin_url,
      pitch_deck_url
    `)
    .eq('user_id', userId)
    .single();
  if (error || !profile) throw new Error('Profile not found');

  return {
    ...(profile.public_data as object || {}),
    image_url: profile.image_url,
    instagram_url: profile.instagram_url,
    whatsapp_number: profile.whatsapp_number,
    linkedin_url: profile.linkedin_url,
    pitch_deck_url: profile.pitch_deck_url
  };
}


/**
 * ✅ Fetch protected data with token validation
 */
export async function getProtectedProfileData(username: string, token: string) {
  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select(`
      public_data,
      protected_data,
      protected_url,
      image_url,
      instagram_url,
      whatsapp_number,
      linkedin_url,
      pitch_deck_url
    `)
    .eq('username', username)
    .single();

  if (error || !profile) throw new Error('Profile not found');

  // Logic check: ensure token matches exactly in the protected_url
  try {
    const url = new URL(profile.protected_url || "", "http://localhost");
    const expectedToken = url.searchParams.get("token");
    if (!expectedToken || expectedToken !== token) {
      throw new Error('Invalid token');
    }
  } catch {
    throw new Error('Invalid token');
  }

  return {
    ...(profile.public_data as object || {}),
    ...(profile.protected_data as object || {}),
    image_url: profile.image_url,
    instagram_url: profile.instagram_url,
    whatsapp_number: profile.whatsapp_number,
    linkedin_url: profile.linkedin_url,
    pitch_deck_url: profile.pitch_deck_url
  };
}

/**
 * ✅ Update token_amount inside the protected_data JSONB
 */
export async function updateTokenAmount(username: string, token: string, newTokenAmount: number) {
  const { data: profile, error: fetchError } = await supabase
    .from('user_profiles')
    .select('user_id, protected_data, protected_url')
    .eq('username', username)
    .single();

  if (fetchError || !profile) throw new Error('Profile not found');
  try {
    const url = new URL(profile.protected_url || "", "http://localhost");
    const expectedToken = url.searchParams.get("token");
    if (!expectedToken || expectedToken !== token) {
      throw new Error('Invalid token');
    }
  } catch {
    throw new Error('Invalid token');
  }

  // Typed JSON update
  const updatedProtected = {
    ...(profile.protected_data as object || {}),
    token_amount: newTokenAmount
  };

  const { error: updateError } = await supabase
    .from('user_profiles')
    .update({ protected_data: updatedProtected })
    .eq('user_id', profile.user_id);

  if (updateError) throw new Error('Failed to update token amount');

  return { message: 'Token amount updated successfully!' };
}

/**
 * Fetch verification credential by MAC address.
 * Returns: { lat, lng, radius_m, label } or null
 * It means that only a set number of NFC rings are being allowed by the ESP.
 */
export async function getCredentialByMac(mac_address: string) {
  const { data, error } = await supabase
    .from("verification_credentials")
    .select("lat, lng, radius_m, label, nfc_id")
    .eq("mac_address", mac_address)
    .single();

  if (error || !data) {
    console.warn("⚠️ MAC not found in verification_credentials:", mac_address);
    return null;
  }

  return data;
}

export async function getUserIdByNFCId(nfc_id: string) {
  const { data, error } = await supabase
    .from("rings")
    .select("user_id")
    .eq("ring_id", nfc_id)
    .single();

  if (error || !data) {
    console.warn("⚠️ Not a valid NFC-ID", nfc_id);
    return null;
  }

  return data;
}


export async function getRingByRingId(ring_id: string) {
  const { data, error } = await supabase
    .from("rings")
    .select("*")
    .eq("ring_id", ring_id)
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

export async function getRingDeviceAccess(
  ringId: string,
  macAddress: string,
  shopkeeperId: string
) {
  const { data, error } = await supabase
    .from("ring_device_access")
    .select("*")
    .eq("ring_id", ringId)
    .eq("mac_address", macAddress)
    .eq("shopkeeper_id", shopkeeperId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch ring device access: ${error.message}`);
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
    .from('user_profiles')
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


export async function getMembershipByUserAndOrg(
  userId: string,
  organizationId: string
) {
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("*")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to fetch membership: ${error.message}`
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
  username: string;
<<<<<<< HEAD
  email: string;
=======
  email: string | null;
>>>>>>> 2882df1563446e84d8edb83ccacbed5adc193036
  type?: string | null;
  public_data?: any;
};


export function isSuperAdmin(user: UserRow | null): boolean {
  if (!user) return false;

  const typeValue = (user.type ?? "").toLowerCase();
  const roleValue =
    (user.public_data?.role ?? user.public_data?.type ?? "").toLowerCase();

  return typeValue === "super_admin" || roleValue === "super_admin";
}


<<<<<<< HEAD
export function getCurrentUserId(req: Request): string | null {
  // Replace this with your existing auth middleware source of truth.
  // Examples:
  // req.user?.id
  // req.auth?.userId
  const user = (req as any).user;
  return user?.id ?? null;
}



=======
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


>>>>>>> 2882df1563446e84d8edb83ccacbed5adc193036
export async function getCurrentUserRow(userId: string): Promise<UserRow | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch current user: ${error.message}`);
  }

<<<<<<< HEAD
  return data;
=======
  return data as UserRow | null;
>>>>>>> 2882df1563446e84d8edb83ccacbed5adc193036
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

<<<<<<< HEAD
  return data;
=======
  return data as MembershipRow | null;
>>>>>>> 2882df1563446e84d8edb83ccacbed5adc193036
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
<<<<<<< HEAD
  const actingUserId = getCurrentUserId(req);
=======
  const actingUserId = await getCurrentUserId(req);
>>>>>>> 2882df1563446e84d8edb83ccacbed5adc193036
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
<<<<<<< HEAD
=======
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
      nfc_id: tapLog.nfc_id,
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
 * Get all approved NFC ring IDs for a specific reader.
 * Used by ESP on boot to warm its local approved-user cache.
 */
export async function getApprovedRingsForReader(readerId: string) {
  // 1. Get all ring_ids that have access to this reader
  const { data: accessRows, error: accessError } = await supabase
    .from("reader_access")
    .select("ring_id")
    .eq("reader_id", readerId);

  if (accessError || !accessRows || accessRows.length === 0) {
    return [];
  }

  const ringIds = accessRows.map((r) => r.ring_id);

  // 2. Resolve each ring_id to a user_id from the rings table
  const { data: rings, error: ringsError } = await supabase
    .from("rings")
    .select("ring_id, user_id")
    .in("ring_id", ringIds);

  if (ringsError || !rings) {
    return [];
  }

  // 3. Check which users have permission = 'yes'
  const userIds = rings.map((r) => r.user_id);
  const { data: users, error: usersError } = await supabase
    .from("user_profiles")
    .select("user_id, permission")
    .in("user_id", userIds)
    .eq("permission", "yes");

  if (usersError || !users) {
    return [];
  }

  const approvedUserIds = new Set(users.map((u) => u.user_id));

  // 4. Return only rings whose users are approved
  return rings
    .filter((r) => approvedUserIds.has(r.user_id))
    .map((r) => ({
      nfc_id: r.ring_id,
      user_id: r.user_id,
    }));
>>>>>>> 2882df1563446e84d8edb83ccacbed5adc193036
}