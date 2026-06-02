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

  // Logic check: ensure token is in the protected_url
  if (!profile.protected_url?.includes(`token=${token}`)) {
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
  if (!profile.protected_url?.includes(`token=${token}`)) throw new Error('Invalid token');

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
  email: string | null;
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
    .from("user_profiles")
    .select("*")
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