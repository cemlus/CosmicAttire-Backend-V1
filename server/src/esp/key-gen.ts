import crypto from 'crypto';
import fs from 'fs';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048, // Standard for RSA
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

// 1. Save the Public Key as a file (for encryptResponse)
fs.writeFileSync('public.pem', publicKey);
console.log('✅ public.pem created successfully.');

// 2. Convert Private Key to a Base64 string (for your .env)
const privateKeyBase64 = Buffer.from(privateKey).toString('base64');

console.log('\n--- COPY THIS TO YOUR .env FILE ---');
console.log(`PRIVATE_PEM_B64=${privateKeyBase64}`);
console.log('------------------------------------\n');