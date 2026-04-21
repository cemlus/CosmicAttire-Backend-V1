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