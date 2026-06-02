import express, { type Request, type Response, type NextFunction } from "express";
import {
    getPublicProfileData,
    getPublicProfileDataById,
    getProtectedProfileData,
    updateTokenAmount,
    getUserById,
    getWalletByUserId,
    overrideUser,
} from "./db/db.js";

import { decrypt } from "./encryptor.js";
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
 * ✅ Public profile by username
 */
router.get("/u/:username", async (req: Request, res: Response) => {
    try {
        const username = req.params.username as string;
        const usernameRegex = /^[a-zA-Z0-9_]+$/;
        if (!username || !usernameRegex.test(username)) {
            return res.status(400).json({ error: "Invalid username format" });
        }
        const publicData = await getPublicProfileData(username);
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
        const username = req.params.username as string;
        if (!username) {
            return res.status(400).json({ error: "Invalid username" });
        }
        const protectedData = await getProtectedProfileData(username, token);
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
        const username = req.params.username as string;
        if (!username) {
            return res.status(400).json({ error: "Invalid username" });
        }
        const amount = Number(new_token_amount);
        if (Number.isNaN(amount) || !Number.isFinite(amount)) {
            return res.status(400).json({ error: "Invalid new_token_amount: must be a valid finite number" });
        }
        const result = await updateTokenAmount(username, token, amount);
        res.json(result);
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

/**
 * ✅ Update permsission
 */
router.post('/override', async (req: Request, res: Response) => {
  try {
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

// router.use('/organization', orgRouter)

export default router;
