import crypto from "crypto";

// Derive a 32-byte encryption key from a secret. Uses ANTHROPIC_API_KEY as the
// base secret since it's already present on every deployment.
const SECRET = process.env.ANTHROPIC_API_KEY || "vibestack-default-key";
const KEY = crypto.createHash("sha256").update(SECRET).digest();

/**
 * Encrypt a plaintext string. Returns "enc:iv:ciphertext:tag" format.
 * Returns null if input is null/undefined.
 */
export function encrypt(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`;
}

/**
 * Decrypt an encrypted string. Handles both encrypted ("enc:...") and
 * legacy plaintext values (returns them as-is for backward compat).
 */
export function decrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  // Legacy plaintext — not encrypted
  if (!value.startsWith("enc:")) return value;

  try {
    const parts = value.split(":");
    if (parts.length !== 4) return null;
    const iv = Buffer.from(parts[1], "hex");
    const encrypted = Buffer.from(parts[2], "hex");
    const tag = Buffer.from(parts[3], "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf-8");
  } catch {
    // If decryption fails, return null rather than corrupt data
    return null;
  }
}
