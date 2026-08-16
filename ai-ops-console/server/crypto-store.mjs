import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function loadOrCreateMasterKey(pathname) {
  mkdirSync(dirname(pathname), { recursive: true });
  if (existsSync(pathname)) {
    const key = Buffer.from(readFileSync(pathname, "utf8").trim(), "base64");
    if (key.length !== 32) throw new Error("中台本地主密钥格式无效");
    return key;
  }

  const key = randomBytes(32);
  writeFileSync(pathname, key.toString("base64"), { mode: 0o600 });
  chmodSync(pathname, 0o600);
  return key;
}

export function encryptSecret(plaintext, masterKey) {
  if (!plaintext) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(payload, masterKey) {
  if (!payload) return "";
  const [version, iv, tag, encrypted] = String(payload).split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("密钥密文格式无效");
  const decipher = createDecipheriv("aes-256-gcm", masterKey, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
}

export function maskSecret(secret) {
  if (!secret) return "未配置";
  if (secret.length <= 8) return "•".repeat(secret.length);
  return `${secret.slice(0, 3)}${"•".repeat(8)}${secret.slice(-4)}`;
}
