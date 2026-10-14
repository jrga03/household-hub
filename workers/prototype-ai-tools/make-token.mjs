// PROTOTYPE: makes an ES256 key pair and a Supabase-shaped access token for the Worker to verify.
import { writeFileSync } from "node:fs";

const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
const base64url = (data) => Buffer.from(data).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const header = { alg: "ES256", typ: "JWT", kid: "prototype" };
const payload = {
  iss: "http://127.0.0.1:54321/auth/v1",
  sub: crypto.randomUUID(),
  aud: "authenticated",
  exp: now + 7 * 24 * 3600,
  iat: now,
  email: "member@example.com",
  phone: "",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { email_verified: true },
  role: "authenticated",
  aal: "aal1",
  amr: [{ method: "password", timestamp: now }],
  session_id: crypto.randomUUID(),
  is_anonymous: false,
};
const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keyPair.privateKey, new TextEncoder().encode(signingInput));
writeFileSync(".dev.vars", `PUBLIC_JWK='${JSON.stringify(publicJwk)}'\n`);
writeFileSync(".token", `${signingInput}.${base64url(signature)}`);
console.log("wrote .dev.vars and .token");
