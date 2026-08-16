import crypto from 'crypto';
import { env } from './config.js';

const ENCRYPTION_KEY = env.PROFILE_ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
    throw new Error("[ERROR] PROFILE_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)!");
}

const KEY = Buffer.from(ENCRYPTION_KEY, 'hex');
const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypts text into a URL-safe base64 string
 */
export function encrypt(text: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

    const encrypted = Buffer.concat([
        cipher.update(text, 'utf8'),
        cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    // Combine IV (12b), Tag (16b), and Ciphertext
    const payload = Buffer.concat([iv, authTag, encrypted]);

    return payload.toString('base64url');
}

/**
 * Decrypts a URL-safe base64 string back to plain text
 * Returns null if decryption fails (tampered data or wrong key)
 */
export function decrypt(encoded: string): string | null {
    try {
        if (typeof encoded !== "string" || !encoded.trim()) {
            throw new Error("decrypt() received an empty or invalid payload");
        }
        const data = Buffer.from(encoded, 'base64url');

        if (data.length < 28) return null; // Minimum: 12 (IV) + 16 (Tag)

        const iv = data.subarray(0, 12);
        const tag = data.subarray(12, 28);
        const encrypted = data.subarray(28);

        const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
        decipher.setAuthTag(tag);

        const decrypted = Buffer.concat([
            decipher.update(encrypted),
            decipher.final()
        ]);

        return decrypted.toString('utf8');
    } catch (error) {
        console.error("Decryption failed:", error);
        return null;
    }
}

/**
 * Derives a per-ring NFC write-lock password from its hardware UID.
 * Deterministic (same UID -> same password always) so re-pairing or an
 * admin override can re-derive it without ever storing it anywhere — a
 * generic NFC-write app has no way to guess it without this server's key.
 * HMAC (not AES) and a domain-separated prefix keep this independent of
 * the encrypt()/decrypt() usage above, even though the key is shared.
 */
export function deriveRingPassword(tagUid: string): { pwd: string; pack: string } {
    const normalized = (tagUid || '').trim().toUpperCase();
    const mac = crypto.createHmac('sha256', KEY).update(`ring-pwd:${normalized}`).digest();
    return {
        pwd: mac.subarray(0, 4).toString('hex'),
        pack: mac.subarray(4, 6).toString('hex'),
    };
}