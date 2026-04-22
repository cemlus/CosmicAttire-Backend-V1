import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { env } from '../../config.js';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Pre-load the Private Key from ENV
const PRIVATE_KEY = env.PRIVATE_PEM_B64
    ? Buffer.from(env.PRIVATE_PEM_B64, 'base64').toString('utf8')
    : null;

// cache it for performance later
const PUBLIC_KEY_PATH = path.join(__dirname, 'public.pem');
let PUBLIC_KEY: string | null = null;

try {
    if (fs.existsSync(PUBLIC_KEY_PATH)) {
        PUBLIC_KEY = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
    }
} catch (err) {
    console.warn("⚠️ Public key file not found or unreadable at startup.");
}

/**
 * ✅ Decrypt payload using Private Key
 */
export function decryptVerificationId(base64Encrypted: string): string {
    if (!PRIVATE_KEY) {
        throw new Error("❌ Server Configuration Error: Private Key missing");
    }

    try {
        const buffer = Buffer.from(base64Encrypted, 'base64');

        const decrypted = crypto.privateDecrypt(
            {
                key: PRIVATE_KEY,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: "sha256",
            },
            buffer
        );

        return decrypted.toString('utf8');
    } catch (err: any) {
        console.error("❌ Decryption failed:", err.message);
        throw new Error("Invalid or corrupted encrypted payload");
    }
}

/**
 * ✅ Encrypt response using Public Key
 */
export function encryptVerificationId(text: string): string {
    if (!PUBLIC_KEY) {
        throw new Error("❌ Server Configuration Error: Public Key missing");
    }

    try {
        const buffer = Buffer.from(text, 'utf8');

        const encrypted = crypto.publicEncrypt(
            {
                key: PUBLIC_KEY,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: "sha256",
            },
            buffer
        );

        return encrypted.toString('base64');
    } catch (err: any) {
        console.error("❌ Encryption failed:", err.message);
        throw new Error("Failed to secure response data");
    }
}