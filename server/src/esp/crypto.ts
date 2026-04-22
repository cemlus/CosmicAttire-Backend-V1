import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const PRIVATE_KEY = process.env.PRIVATE_PEM_B64
  ? Buffer.from(process.env.PRIVATE_PEM_B64, 'base64').toString('utf8')
  : null;

// Load Public Key from local file once at startup
const PUBLIC_KEY_PATH = path.join(__dirname, 'keys/public.pem');
let PUBLIC_KEY: string | null = null;

try {
  if (fs.existsSync(PUBLIC_KEY_PATH)) {
    PUBLIC_KEY = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
  }
} catch (err) {
  console.error("⚠️ Failed to load public.pem from disk:", err);
}

/**
 * ✅ Decrypt payload using Private Key
 * Used to read messages sent BY the ESP32
 */
export function decryptPayload(base64Encrypted: string): string {
  if (!PRIVATE_KEY) {
    throw new Error("Server Configuration Error: PRIVATE_PEM_B64 missing in .env");
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
    console.error("❌ Decryption failed. Possible wrong key or tampered data:", err.message);
    throw new Error("Invalid encrypted payload");
  }
}

/**
 * ✅ Encrypt response using Public Key
 * Used to send secret messages TO the ESP32
 */
export function encryptResponse(text: string): string {
  if (!PUBLIC_KEY) {
    throw new Error("Server Configuration Error: public.pem file missing in directory");
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
    throw new Error("Failed to encrypt response");
  }
}