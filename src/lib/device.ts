/**
 * A per-browser id for the sign-in page: a random value plus an HMAC, so a script can't make up
 * new ids to get around the per-browser limit, and a code can be tied to the browser that asked
 * for it. Runs in the proxy and in the auth hooks (Web Crypto, no Node-only APIs).
 */
export const DEVICE_COOKIE = "pulse_device";

const enc = new TextEncoder();
let key: Promise<CryptoKey> | null = null;

function hmacKey() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required");
  key ??= crypto.subtle.importKey("raw", enc.encode(`pulse-device:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return key;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function newDeviceToken() {
  const id = crypto.randomUUID();
  const sig = hex(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(id)));
  return `${id}.${sig}`;
}

/** Returns the id if the token is one we issued, otherwise null. */
export async function verifyDeviceToken(token: string | undefined | null) {
  const m = /^([0-9a-f-]{36})\.([0-9a-f]{64})$/.exec(token ?? "");
  if (!m) return null;
  const expected = hex(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(m[1]!)));
  // Constant-time compare.
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= expected.charCodeAt(i) ^ m[2]!.charCodeAt(i);
  return diff === 0 ? m[1]! : null;
}

export function readCookie(header: string | null | undefined, name: string) {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}
