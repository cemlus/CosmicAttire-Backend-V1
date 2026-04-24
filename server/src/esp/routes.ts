import express, { type Request, type Response, Router } from "express";
import { decryptPayload, encryptPayload } from "./crypto.js";
import { getUserById, getCredentialByMac, getUserIdByNFCId, getRingByNFCId } from "../db/db.js";
import { decrypt, encrypt } from "../encryptor.js";

const espRouter: Router = express.Router();

interface ESPPayload {
  mac: string;
  nfc_id: string;
  timestamp: number;
  parsedLat: number;
  parsedLng: number;
}

/**
 * ✅ POST /verify-user-by-id
 * Payload is sent in the Request Body as { "data": "BASE64_ENCRYPTED_STRING" }
 */
espRouter.post("/verify-user-by-id", async (req: Request, res: Response) => {
  const { data: encryptedPayload } = req.body;

  if (!encryptedPayload) {
    return res.status(400).json({ error: "Missing encrypted payload" });
  }

  try {
    // 1. Decrypt the ESP32 payload
    const decrypted = decryptPayload(encryptedPayload);
    const payload: ESPPayload = JSON.parse(decrypted as string);
    console.log("🔓 Decrypted ESP payload:", payload);

    const { nfc_id, mac, timestamp, parsedLat, parsedLng } = payload;

    // 2. Validate timestamp (2 minute window / 120 seconds)
    const now = Math.floor(Date.now() / 1000);
    const timeDiff = Math.abs(now - timestamp);
    if (timeDiff > 120) {
      return res.status(403).json({
        data: encryptPayload("ERROR: Clock drift too high or Replay detected")
      });
    }

    // 3. Lookup Hardware Credential and User in Supabase
    const [credential, userId] = await Promise.all([
      getCredentialByMac(mac),
      getUserIdByNFCId(nfc_id)
    ])

    if (!credential) {
      return res.json({ data: encryptPayload("ACCESS DENIED: Unrecognized Hardware") });
    }

    // 4. Geofence Validation
    const dist = getDistanceKM(parsedLat, parsedLng, credential.lat, credential.lng);
    const radiusKM = credential.radius_m / 1000;

    if (dist > radiusKM) {
      return res.json({ data: encryptPayload("ACCESS DENIED: Location Mismatch") });
    }

    // 5. NFC Hardware ID Validation
    const ring = await getRingByNFCId(nfc_id);
    
    if (!ring?.ring_id && ring?.ring_id !== nfc_id) {
      return res.json({ data: encryptPayload("ACCESS DENIED: Hardware Tampered") });
    }

    // 6. Check user permission (Must be "yes")
    const user = await getUserById(userId?.user_id as string);

    if (!user || user.permission?.toLowerCase() !== "yes") {
      return res.json({ data: encryptPayload("ACCESS DENIED: User Unauthorized") });
    }

    // 7. Success - Generate the one-time verification link

    const encryptedId = encrypt(userId?.user_id as string);
    const verificationLink = `https://yourdomain.com/verification-1/${encryptedId}`;

    return res.json({
      data: encryptPayload(`SUCCESS:${verificationLink}`)
    });

  } catch (err) {
    console.error("❌ ESP /verify error:", (err as Error).message);
    return res.status(400).json({ error: "Security validation failed" });
  }
});

/**
 * 🌍 Helper: Haversine formula for Geofencing
 */
function getDistanceKM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

export default espRouter;
