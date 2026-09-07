import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Encrypted storage for Academia session cookies.
 *
 * We store the Zoho session a user hands us at login — never their password.
 * The distinction matters: this table decrypts on a schedule (the sync worker
 * has to replay the cookie), so encryption-at-rest buys us less than people
 * assume. What actually limits the blast radius is that the plaintext is a
 * short-lived token for one student portal rather than a credential the user
 * has probably reused on their email.
 *
 * AES-256-GCM. Fresh 12-byte nonce per write — never reuse an IV under the
 * same key, it is catastrophic for GCM and silently so.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export interface SealedBox {
  ciphertext: string;
  iv: string;
  authTag: string;
}

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.VAULT_KEY;
  if (!raw) {
    throw new Error(
      "VAULT_KEY is not set. Generate one with:\n" +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }

  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== KEY_BYTES) {
    throw new Error(
      `VAULT_KEY must decode to ${KEY_BYTES} bytes, got ${decoded.length}. ` +
        "It should be base64 of 32 random bytes."
    );
  }

  cachedKey = decoded;
  return decoded;
}

/** Encrypt a cookie jar (or any string) for storage. */
export function seal(plaintext: string): SealedBox {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

/**
 * Decrypt a stored box. Throws if the ciphertext or tag has been tampered with
 * — GCM authenticates, so a bad tag is a hard failure rather than garbage out.
 */
export function open(box: SealedBox): string {
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(box.iv, "base64"));
  decipher.setAuthTag(Buffer.from(box.authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(box.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Constant-time compare, for anywhere we check a demo token or similar. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
