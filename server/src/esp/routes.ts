import express, { type Request, type Response, Router } from "express";
import { getUserById, getCredentialByMac, getUserIdByNFCId, getPaymentMachine, getRingFromRingId, getWalletByUserId, getRingDeviceAccess, overrideUser } from "../db/db.js";
import { decrypt, encrypt } from "../encryptor.js";
import { supabase } from "../db/supaBaseClient.js";

const espRouter: Router = express.Router();

interface ESPPayload {
  user_id: string,
  esp_id: string,
  reader_id: string,
  mac: string;
  nfc_id: string;
  timestamp: number;
  lat: number;
  lng: number;
}

interface ESPTestPayload {
  uid: string;
  nfcid: string;
  device_id: string;
  token: string;
}

espRouter.post("/test-2", async (req: Request, res: Response) => {
  try {
    const encryptedPayload =
      typeof req.body === "string"
        ? req.body
        : req.body?.data ?? req.body?.encryptedPayload ?? req.body?.payload;

    if (!encryptedPayload || typeof encryptedPayload !== "string") {
      return res.status(400).json({ error: "Missing encrypted payload" });
    }

    console.log("Encrypted payload:", encryptedPayload);

    // 1. Decrypt the payload
    const decrypted = decrypt(encryptedPayload);

    if (!decrypted) {
      return res.status(400).json({ error: "Decryption failed: Invalid or tampered payload" });
    }

    // 2. Safely parse JSON
    let payload: ESPTestPayload;
    try {
      payload = JSON.parse(decrypted);
    } catch (parseErr) {
      return res.status(400).json({ error: "Failed to parse decrypted JSON payload" });
    }

    console.log("🔓 Decrypted ESP payload:", payload);

    // 3. Destructure and validate
    const { uid, nfcid, device_id, token } = payload;

    if (!uid || !nfcid || !device_id || !token) {
      return res.status(400).json({
        error: "Invalid payload: missing required fields (uid, nfcid, device_id, token)",
        received: payload,
      });
    }

    // 4. Encrypt the UID symmetrically for the verification link
    const encryptedId = encrypt(uid);
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const verificationLink = `${baseUrl}/verification-1/${encryptedId}`;
    const sendingPayload = {
      data: `SUCCESS:${verificationLink}`,
      isSuccess: 1
    }

    return res.json({
      sendingPayload
    });
  } catch (err) {
    console.error("❌ ESP /test-2 error:", err);
    return res.status(500).json({ error: "Internal server error during validation" });
  }
});

/**
 * ✅ POST /verify-user-by-id
 * Payload is sent in the Request Body as { "data": "BASE64_ENCRYPTED_STRING" }
 */
espRouter.post("/verify-user-by-id", async (req: Request, res: Response) => {
  function sendFailedResponse(statusCode: number, body: string) {
    const isError = statusCode >= 400 || body.startsWith("ERROR:");
    return res.status(statusCode).json({
      status: isError ? "ERROR" : "SUCCESS",
      isSuccess: 0,
      message: body.replace(/^ERROR:\s*/, ""),
    });
  }

  try {
    // 1. Decrypt the ESP32 payload
    const encryptedPayload =
      typeof req.body === "string"
        ? req.body
        : req.body?.data ?? req.body?.encryptedPayload ?? req.body?.payload;

    if (!encryptedPayload || typeof encryptedPayload !== "string") {
      return sendFailedResponse(400, "ERROR: Encrypted Payload");
    }

    console.log("Encrypted payload:", encryptedPayload);

    const decrypted = decrypt(encryptedPayload);
    const payload: ESPPayload = JSON.parse(decrypted as string);
    console.log("🔓 Decrypted ESP payload:", payload);

    const { nfc_id, mac, timestamp, lat, lng } = payload;

    // 2. Validate timestamp (2 minute window / 120 seconds)
    const now = Math.floor(Date.now() / 1000);
    const timeDiff = Math.abs(now - timestamp);
    if (timeDiff > 120) {
      return sendFailedResponse(403, "ERROR: Clock drift too high or Replay detected");
    }

    // 3. Lookup Hardware Credential and User in Supabase
    const [credential, userId] = await Promise.all([
      getCredentialByMac(mac),
      getUserIdByNFCId(nfc_id)
    ])

    if (!credential) {
      return sendFailedResponse(403, "ERROR: Unrecognized Hardware");
    }

    // 4. Geofence Validation
    const dist = getDistanceKM(lat, lng, credential.lat, credential.lng);
    const radiusKM = credential.radius_m / 1000;

    if (dist > radiusKM) {
      return sendFailedResponse(403, "ERROR: Location Mismatch");
    }

    // 5. NFC Hardware ID Validation
    if (credential.nfc_id && credential.nfc_id !== nfc_id) {
      return sendFailedResponse(403, "ERROR: Hardware Tampered");
    }

    // 6. Check user permission (Must be "yes")
    const user = await getUserById(userId?.user_id as string);

    if (!user || user.permission?.toLowerCase() !== "yes") {
      return sendFailedResponse(403, "ERROR: User Unauthorized");
    }

    // 7. Success - Generate the one-time verification link
    const encryptedId = encrypt(userId?.user_id as string);
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const verificationLink = `${baseUrl}/verification-1/${encryptedId}`;
    const sendingPayload = {
      data: `SUCCESS:${verificationLink}`,
      isSuccess: 1
    }

    return res.json({
      sendingPayload
    });

  } catch (err) {
    console.error("❌ ESP /verify error:", (err as Error).message);
    return res.status(400).json({ error: "Security validation failed" });
  }
});

/**
 * ✅ POST /verify
 * { ring_id, mac_address, shopkeeper_id, amount, timestamp, lat, lng }
 */
espRouter.post("/verify", async (req: Request, res: Response) => {
  const { data: encryptedPayload } = req.body;
  const isEncryptedRequest = typeof encryptedPayload === "string" && encryptedPayload.length > 0;

  const sendPaymentResponse = (statusCode: number, body: string | Record<string, unknown>) => {
    if (isEncryptedRequest) {
      const text = typeof body === "string" ? body : JSON.stringify(body);
      return res.status(statusCode).json({ data: encrypt(text) });
    }

    if (typeof body === "string") {
      const isError = statusCode >= 400 || body.startsWith("ERROR:");
      return res.status(statusCode).json({
        status: isError ? "ERROR" : "SUCCESS",
        message: body.replace(/^ERROR:\s*/, ""),
      });
    }

    return res.status(statusCode).json(body);
  };

  try {
    const decryptedPayload = isEncryptedRequest
      ? decrypt(encryptedPayload)
      : JSON.stringify(req.body);
    const {
      nfc_id,
      mac_address,
      shopkeeper_id,
      amount,
      timestamp,
      lat,
      lng,
    } = JSON.parse(decryptedPayload as string);

    if (
      !nfc_id ||
      !mac_address ||
      !shopkeeper_id ||
      amount == null ||
      timestamp == null ||
      lat == null ||
      lng == null
    ) {
      console.error("❌ All credentials are not passed");
      return sendPaymentResponse(400, "ERROR: Verification failed");
    }

    // checking timestamp and amount validity
    const amountNum = Number(amount);
    const tsNum = Number(timestamp);


    if (!Number.isFinite(amountNum) || amountNum <= 0 || !Number.isInteger(amountNum)) {
      return sendPaymentResponse(400, "ERROR: Invalid token amount");
    }

    if (!Number.isFinite(tsNum)) {
      return sendPaymentResponse(400, "ERROR: Invalid timestamp");
    }

    // Accept either seconds or milliseconds
    const nowMs = Date.now();
    const payloadMs = tsNum > 1e12 ? tsNum : tsNum * 1000;
    const timeDiff = Math.abs(nowMs - payloadMs);

    if (timeDiff > 120000) {
      return sendPaymentResponse(403, "ERROR: Clock drift too high or Replay detected");
    }

    // Check 2 -> Verify device
    const paymentDevice = await getPaymentMachine(mac_address);

    if (!paymentDevice || paymentDevice.mac_address !== mac_address) {
      return sendPaymentResponse(403, "ERROR: Payment device doesn't exist");
    }

    // Check 3 -> Verify shopkeeper matches the device
    if (String(paymentDevice.shopkeeper_id) !== String(shopkeeper_id)) {
      return sendPaymentResponse(403, "ERROR: Shopkeeper does not match device");
    }

    // Check 4 -> Ring validation
    const ring = await getRingFromRingId(nfc_id);

    if (!ring || ring.ring_id !== nfc_id) {
      return sendPaymentResponse(403, "ERROR: Invalid Ring");
    }

    const customerId = ring.user_id;

    const user = await getUserIdByNFCId(nfc_id);
    if (!user || String(user.user_id) !== String(customerId)) {
      return sendPaymentResponse(403, "ERROR: Ring doesn't belong to user");
    }

    // validate if ring is allowed for this device/shopkeeper

    const access = await getRingDeviceAccess(
      nfc_id,
      mac_address,
      shopkeeper_id
    );

    if (!access) {
      return sendPaymentResponse(403, "ERROR: Ring is not allowed for this payment device");
    }

    if (String(access.user_id) !== String(ring.user_id)) {
      return sendPaymentResponse(403, "ERROR: Ring access record does not match user");
    }

    // Check 5 -> Wallet validation
    const customerWallet = await getWalletByUserId(customerId);
    const shopkeeperWallet = await getWalletByUserId(shopkeeper_id);

    if (!customerWallet) {
      return sendPaymentResponse(403, "ERROR: Customer wallet not found");
    }

    if (!shopkeeperWallet) {
      return sendPaymentResponse(403, "ERROR: Shopkeeper wallet not found");
    }

    if (amountNum > Number(customerWallet.balance)) {
      return sendPaymentResponse(403, "ERROR: Insufficient balance in wallet");
    }

    // Transaction logic

    const newCustomerBalance = Number(customerWallet.balance) - amountNum;
    const newShopkeeperBalance = Number(shopkeeperWallet.balance) + amountNum;

    // Update customer wallet
    const { error: debitError } = await supabase
      .from("wallets")
      .update({
        balance: newCustomerBalance,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", customerId);

    if (debitError) {
      console.error("❌ Debit failed:", debitError.message);
      return sendPaymentResponse(500, "ERROR: Failed to debit customer wallet");
    }

    // Update shopkeeper wallet
    const { error: creditError } = await supabase
      .from("wallets")
      .update({
        balance: newShopkeeperBalance,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", shopkeeper_id);

    if (creditError) {
      console.error("❌ Credit failed:", creditError.message);

      // Best-effort rollback for now
      await supabase
        .from("wallets")
        .update({
          balance: Number(customerWallet.balance),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", customerId);

      return sendPaymentResponse(500, "ERROR: Failed to credit shopkeeper wallet");
    }

    // Insert transaction record
    const { data: txData, error: txError } = await supabase
      .from("transactions")
      .insert({
        user_id: customerId,
        ring_id: ring.id,
        amount: amountNum,
        type: "payment",
        description: "Ring payment",
        merchant: paymentDevice.mac_address,
        category: "payment",
        location: paymentDevice.location ?? null,
        status: "completed",
      })
      .select("id")
      .single();

    if (txError) {
      console.error("❌ Transaction insert failed:", txError.message);

      // Best-effort rollback for now
      await supabase
        .from("wallets")
        .update({
          balance: Number(customerWallet.balance),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", customerId);

      await supabase
        .from("wallets")
        .update({
          balance: Number(shopkeeperWallet.balance),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", shopkeeper_id);

      return sendPaymentResponse(500, "ERROR: Failed to save transaction");
    }

    return sendPaymentResponse(200, {
      status: "SUCCESS",
      isSuccess: 1,
      message: "Tokens transferred successfully",
      transaction_id: txData.id,
      customer_id: customerId,
      shopkeeper_id,
      amount: amountNum,
      balances: {
        customer: {
          before: Number(customerWallet.balance),
          after: newCustomerBalance,
        },
        shopkeeper: {
          before: Number(shopkeeperWallet.balance),
          after: newShopkeeperBalance,
        },
      },
    });
  } catch (err) {
    console.error("❌ Payment verification flow failed:", (err as Error).message);
    return sendPaymentResponse(500, "ERROR: Payment verification flow failed");
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
