import path from 'path';
import { supabase } from './supaBaseClient.js';

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
