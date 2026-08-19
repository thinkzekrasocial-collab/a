/**
 * Auth primitives for Cloudflare Workers — zero external dependencies.
 *
 *  • Passwords: PBKDF2 (SHA-256, 60k rounds) → "pbkdf2$iters$salt$hash"
 *  • Sessions : HMAC-SHA256 signed JWT, 12h expiry, HTTP-only cookie.
 *
 * The AUTH_SECRET is a Worker Secret set with `wrangler secret put AUTH_SECRET`.
 */

const encoder = new TextEncoder();

export interface SessionUser {
  id: number;
  name: string;
  username: string;
  roles: string[];
  permissions: string[];
}

// ---------------------------------------------------------------------------
// Base64 helpers
// ---------------------------------------------------------------------------

function b64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function b64url(bytes: Uint8Array): string {
  return b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Password hashing (PBKDF2-HMAC-SHA256)
// ---------------------------------------------------------------------------

async function pbkdf2Hash(
  password: string,
  salt: BufferSource,
  iterations: number
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode("ab-maintenance-bd:password-v1")
  );
  return new Uint8Array(sig);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const hash = await pbkdf2Hash(password, salt, 60_000);
  return `pbkdf2$${60_000}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const expected = fromB64(parts[3]);
  const actual = await pbkdf2Hash(password, fromB64(parts[2]), iterations);
  return timingSafeEqual(actual, expected);
}

// ---------------------------------------------------------------------------
// Session tokens (JWT — HS256)
// ---------------------------------------------------------------------------

const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signSessionToken(
  userId: number | string,
  secret: string
): Promise<string> {
  const header = b64url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    encoder.encode(
      JSON.stringify({ sub: String(userId), iat: now, exp: now + SESSION_TTL_SECONDS })
    )
  );
  const signingInput = `${header}.${payload}`;
  const sig = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    encoder.encode(signingInput)
  );
  return `${signingInput}.${b64url(new Uint8Array(sig))}`;
}

export async function verifySessionToken(
  token: string,
  secret: string
): Promise<string | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const key = await hmacKey(secret);
    const expected = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`${headerB64}.${payloadB64}`)
    );
    if (!timingSafeEqual(new Uint8Array(expected), fromB64(sigB64))) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(fromB64(payloadB64))
    ) as { sub?: string; exp?: number };
    if (!payload.sub) return null;
    if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload.sub;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "ab_session";
