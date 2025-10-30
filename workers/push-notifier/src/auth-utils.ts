/**
 * JWT Authentication Utilities for Cloudflare Workers
 *
 * Implements Supabase JWT verification using WebCrypto API
 * for secure server-side authentication.
 */

export interface JWTPayload {
  sub: string; // User ID
  email?: string;
  role: string;
  aud: string;
  exp: number;
  iat: number;
  household_id?: string;
}

/**
 * Decodes a base64url-encoded string to Uint8Array
 *
 * @param str - Base64url encoded string
 * @returns Decoded bytes
 */
export function base64UrlDecode(str: string): Uint8Array {
  // Replace base64url characters with base64 characters
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");

  // Pad with '=' to make length multiple of 4
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }

  // Decode base64 to binary string
  const binaryString = atob(base64);

  // Convert binary string to Uint8Array
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes;
}

/**
 * Verifies a Supabase JWT token using HMAC-SHA256 signature verification
 *
 * @param token - JWT token from Authorization header (without "Bearer " prefix)
 * @param jwtSecret - Supabase JWT secret for signature verification
 * @returns Decoded payload if valid, throws error otherwise
 *
 * @throws {Error} Invalid token format
 * @throws {Error} Invalid signature
 * @throws {Error} Token expired
 */
export async function verifySupabaseJWT(token: string, jwtSecret: string): Promise<JWTPayload> {
  // Parse JWT structure
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format: must have 3 parts (header.payload.signature)");
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // Decode header and payload
  let header: { alg: string; typ?: string };
  let payload: JWTPayload;

  try {
    const headerStr = new TextDecoder().decode(base64UrlDecode(headerB64));
    header = JSON.parse(headerStr);

    const payloadStr = new TextDecoder().decode(base64UrlDecode(payloadB64));
    payload = JSON.parse(payloadStr);
  } catch {
    throw new Error("Invalid JWT: failed to decode header or payload");
  }

  // Verify algorithm is HS256
  if (header.alg !== "HS256") {
    throw new Error(`Unsupported algorithm: ${header.alg} (expected HS256)`);
  }

  // Check token expiry
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error(`Token expired at ${new Date(payload.exp * 1000).toISOString()}`);
  }

  // Verify signature using WebCrypto API
  const encoder = new TextEncoder();
  const data = encoder.encode(`${headerB64}.${payloadB64}`);
  const secretKey = encoder.encode(jwtSecret);

  // Import secret key for HMAC
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    secretKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  // Decode provided signature
  const providedSignature = base64UrlDecode(signatureB64);

  // Verify signature
  const isValid = await crypto.subtle.verify("HMAC", cryptoKey, providedSignature, data);

  if (!isValid) {
    throw new Error("Invalid JWT signature");
  }

  return payload;
}

/**
 * Extracts JWT token from Authorization header
 *
 * @param authHeader - Authorization header value
 * @returns JWT token without "Bearer " prefix
 * @throws {Error} Missing or invalid Authorization header
 */
export function extractToken(authHeader: string | null): string {
  if (!authHeader) {
    throw new Error("Missing Authorization header");
  }

  if (!authHeader.startsWith("Bearer ")) {
    throw new Error('Invalid Authorization header format (must start with "Bearer ")');
  }

  return authHeader.substring(7);
}
