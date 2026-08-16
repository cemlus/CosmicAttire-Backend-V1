import express, { type Request, type Response, type NextFunction } from "express";
import {
    getPublicProfileData,
    getPublicProfileDataById,
    getProtectedProfileData,
    updateTokenAmount,
    getUserById,
    getWalletByUserId,
    overrideUser,
    getCurrentUserId,
    getCurrentUserRow,
    isSuperAdmin,
    getOrCreateShortCode,
    requireOrgAccess,
} from "./db/db.js";

import { decrypt, encrypt, deriveRingPassword } from "./encryptor.js";
import { supabase } from "./db/supaBaseClient.js";
import { env } from "./config.js";
// import  from "./adminRoutes.js";

const router = express.Router();

router.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`▶️ API Request: ${req.method} ${req.originalUrl}`);
    next();
});

router.get("/ping", (req: Request, res: Response) => {
    res.send("✅ API is live");
});

/**
 * ✅ Public profile by encrypted ID
 */
router.get("/profile/:encryptedId", async (req: Request, res: Response) => {
    try {
        const encryptedId = req.params.encryptedId as string;
        if (!encryptedId) {
            console.error("❌ No encryptedId passed");
            return;
        }
        const userId = decrypt(encryptedId);
        if (!userId) throw new Error("Decryption failed");

        const publicData = await getPublicProfileDataById(userId);
        res.json({ publicData });
    } catch (err: any) {
        console.error("❌ Profile decrypt error:", err.message);
        res.status(404).json({ error: "Invalid or expired profile link" });
    }
});

/**
 * ✅ Public profile by cosmic_id — the app's short shareable handle. Route
 * path kept as /u/:username for URL stability; the value itself is a
 * cosmic_id now (there's no username column in the unified schema).
 */
router.get("/u/:username", async (req: Request, res: Response) => {
    try {
        const cosmicId = req.params.username as string;
        const cosmicIdRegex = /^[a-zA-Z0-9_]+$/;
        if (!cosmicId || !cosmicIdRegex.test(cosmicId)) {
            return res.status(400).json({ error: "Invalid cosmic ID format" });
        }
        const publicData = await getPublicProfileData(cosmicId);
        res.json({ publicData });
    } catch (err: any) {
        res.status(404).json({ error: err.message });
    }
});

/**
 * ✅ Protected route with token
 */
router.get("/u/:username/protected", async (req: Request, res: Response) => {
    try {
        const token = req.query.token as string;
        if (!token) throw new Error("Token is required");
        const cosmicId = req.params.username as string;
        if (!cosmicId) {
            return res.status(400).json({ error: "Invalid cosmic ID" });
        }
        const protectedData = await getProtectedProfileData(cosmicId, token);
        res.json({ protectedData });
    } catch (err: any) {
        res.status(401).json({ error: err.message });
    }
});

/**
 * ✅ Update token
 */
router.post("/u/:username/protected/update-token", async (req: Request, res: Response) => {
    try {
        const { token, new_token_amount } = req.body;
        const cosmicId = req.params.username as string;
        if (!cosmicId) {
            return res.status(400).json({ error: "Invalid cosmic ID" });
        }
        const amount = Number(new_token_amount);
        if (Number.isNaN(amount) || !Number.isFinite(amount)) {
            return res.status(400).json({ error: "Invalid new_token_amount: must be a valid finite number" });
        }
        const result = await updateTokenAmount(cosmicId, token, amount);
        res.json(result);
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

/**
 * ✅ Revoke a user's access (admin-only — this used to accept any caller)
 */
router.post('/override', async (req: Request, res: Response) => {
  try {
    const actingUserId = await getCurrentUserId(req);
    if (!actingUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const actingUser = await getCurrentUserRow(actingUserId);
    if (!isSuperAdmin(actingUser)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: "userId is required"
      });
    }

    const result = await overrideUser(userId);

    return res.status(200).json(result);

  } catch (err: any) {
    return res.status(400).json({
      error: err.message
    });
  }
});

/**
 * ✅ ESP encrypted user verification
 * http://localhost:8080/api/verify-user-by-id?encryptedId=asdasdasdadsasdadasdadsasdasd
 */
const verifyUserById = async (req: Request, res: Response) => {
    try {
        const encryptedId = (req.query.encryptedId || req.params.encryptedId) as string | undefined;
        if (!encryptedId) {
            console.error("❌ No encryptedId passed");
            return res.status(400).json({ error: "Missing encryptedId" });
        }

        const userId = decrypt(encryptedId);

        if (!userId) throw new Error("Invalid verification ID");

        const user = await getUserById(userId);

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        res.status(200).json({
            user_id: userId,
            permission: user.permission,
            zone: "General Access",
            timestamp: user.timestamp,
            name: user.name,
            image_url: user.image_url,
        });
    } catch (err: any) {
        console.error("❌ Verification error:", err.message);
        res.status(400).json({ error: "Invalid or expired verification ID" });
    }
};

router.get("/wallet/balance/:userId", async (req: Request, res: Response) => {
    try {
        const userId = req.params.userId as string;
        if (!userId) {
            return res.status(400).json({ error: "User ID is required" });
        }
        const wallet = await getWalletByUserId(userId);
        if (!wallet) {
            return res.status(404).json({ error: "Wallet not found" });
        }
        res.status(200).json({ balance: wallet.balance });
    } catch (err: any) {
        console.error("❌ Error fetching wallet:", err.message);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.get("/verify-user-by-id", verifyUserById);
router.get("/verify-user-by-id/:encryptedId", verifyUserById);

/**
 * Generate a networking profile URL for a given userId.
 * Encrypts the userId with AES and returns the full profile link.
 *
 * GET /api/networking-url/:userId
 * Response: { url: "http://<host>/profile/<encryptedUserId>" }
 */
router.get("/networking-url/:userId", (req: Request, res: Response) => {
    try {
        const userId = req.params.userId as string;
        if (!userId) {
            return res.status(400).json({ error: "userId is required" });
        }

        const encryptedId = encrypt(userId);
        if (!encryptedId) {
            return res.status(500).json({ error: "Encryption failed" });
        }

        const protocol = req.protocol;
        const host = env.PUBLIC_LINK_DOMAIN || req.get("host");
        const profileUrl = `${protocol}://${host}/profile/${encodeURIComponent(encryptedId)}`;

        res.status(200).json({ url: profileUrl });
    } catch (err: any) {
        console.error("❌ Networking URL generation error:", err.message);
        res.status(500).json({ error: "Failed to generate networking URL" });
    }
});

/**
 * Same idea as /networking-url, but short enough to fit on small NFC tags
 * (e.g. NTAG213, ~137 usable bytes) — the AES-encrypted /profile/<id> URL
 * regularly runs 140+ bytes once the domain is included and won't fit.
 *
 * GET /api/short-url/:userId
 * Response: { url: "http://<host>/p/<code>" }
 */
router.get("/short-url/:userId", async (req: Request, res: Response) => {
    try {
        const userId = req.params.userId as string;
        if (!userId) {
            return res.status(400).json({ error: "userId is required" });
        }

        const code = await getOrCreateShortCode(userId);
        const protocol = req.protocol;
        const host = env.PUBLIC_LINK_DOMAIN || req.get("host");
        const shortUrl = `${protocol}://${host}/p/${code}`;

        res.status(200).json({ url: shortUrl });
    } catch (err: any) {
        console.error("❌ Short URL generation error:", err.message);
        res.status(500).json({ error: "Failed to generate short URL" });
    }
});

/**
 * Derives the NFC write-lock password for a ring's hardware UID, so the
 * app can password-protect a tag right after writing its profile URL and
 * unlock it again on legitimate re-pairing. Never stored — recomputed
 * deterministically from the UID every time (see deriveRingPassword).
 *
 * Access rule: an unclaimed tag, or one already owned by the caller, is
 * always derivable (normal pairing/re-pairing). A tag claimed by someone
 * else requires the caller to be an admin/super_admin of that device's
 * organization — this is what makes "other users can't overwrite a ring"
 * hold even against a client that skips the app UI and calls this
 * endpoint directly with someone else's tag UID.
 *
 * POST /api/ring-password
 * Body: { tagUid: string }
 * Response: { pwd: "aabbccdd", pack: "aabb" } (hex)
 */
router.post("/ring-password", async (req: Request, res: Response) => {
    try {
        const actingUserId = await getCurrentUserId(req);
        if (!actingUserId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const tagUid = String(req.body?.tagUid || "").trim().toUpperCase();
        if (!tagUid) {
            return res.status(400).json({ error: "tagUid is required" });
        }

        const { data: ring, error: ringErr } = await supabase
            .from("rings")
            .select("user_id")
            .or(`ring_id.eq.${tagUid},nfc_uid.eq.${tagUid}`)
            .maybeSingle();

        if (ringErr) {
            return res.status(500).json({ error: ringErr.message });
        }

        if (ring && ring.user_id !== actingUserId) {
            // device_registry isn't in the generated Supabase types yet
            // (same stale-types gap as elsewhere in this file) — cast to
            // any rather than blocking on a type regen.
            const { data: registryRow, error: registryErr } = await (supabase as any)
                .from("device_registry")
                .select("organization_id")
                .eq("device_id", tagUid)
                .maybeSingle();

            if (registryErr) {
                return res.status(500).json({ error: registryErr.message });
            }
            if (!registryRow?.organization_id) {
                return res.status(403).json({ error: "This ring belongs to another account." });
            }

            try {
                await requireOrgAccess(req, registryRow.organization_id, ["admin"]);
            } catch (err: any) {
                const status = err?.message === "Unauthorized" ? 401 : 403;
                return res.status(status).json({ error: "This ring belongs to another account." });
            }
        }

        const { pwd, pack } = deriveRingPassword(tagUid);
        return res.json({ pwd, pack });
    } catch (err: any) {
        console.error("❌ ring-password error:", err.message);
        return res.status(500).json({ error: "Failed to derive ring password" });
    }
});

// router.use('/organization', orgRouter)

// ─────────────────────────────────────────────────────
// FCM Push Notifications - Device Tokens
// ─────────────────────────────────────────────────────

// POST /device-tokens — Register FCM token (called on app login)
router.post("/device-tokens", async (req: Request, res: Response) => {
  const userId = await getCurrentUserId(req);
  if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
  }

  const { fcm_token, platform, device_name } = req.body;
  if (!fcm_token) {
      return res.status(400).json({ error: "Missing fcm_token" });
  }

  const { error } = await (supabase as any)
    .from("device_tokens")
    .upsert({
      user_id: userId,
      fcm_token,
      platform: platform || "android",
      device_name: device_name || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,fcm_token" });

  if (error) {
      console.error("❌ Failed to register device token:", error.message);
      return res.status(500).json({ error: error.message });
  }
  return res.json({ message: "Token registered" });
});

// DELETE /device-tokens — Unregister on logout
router.delete("/device-tokens", async (req: Request, res: Response) => {
  const userId = await getCurrentUserId(req);
  if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
  }

  const { fcm_token } = req.body;
  if (!fcm_token) {
      return res.status(400).json({ error: "Missing fcm_token" });
  }

  const { error } = await (supabase as any)
    .from("device_tokens")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("fcm_token", fcm_token);

  if (error) {
      console.error("❌ Failed to deactivate device token:", error.message);
      return res.status(500).json({ error: error.message });
  }

  return res.json({ message: "Token deactivated" });
});

export default router;
