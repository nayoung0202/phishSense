import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const DEV_FALLBACK_SECRET = "dev-only-ai-key-secret";

const resolveSecret = () =>
  process.env.AI_KEY_SECRET?.trim() ||
  process.env.SMTP_SECRET?.trim() ||
  DEV_FALLBACK_SECRET;

export const hasAiKeySecret = () =>
  Boolean(process.env.AI_KEY_SECRET?.trim() || process.env.SMTP_SECRET?.trim());

const createSecretKey = () => crypto.createHash("sha256").update(resolveSecret()).digest();

export function encryptAiKey(raw: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, createSecretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptAiKey(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    return "";
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    createSecretKey(),
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function createAiKeyFingerprint(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
