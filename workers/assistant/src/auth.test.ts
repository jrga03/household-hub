import { describe, expect, it, vi } from "vitest";
import { createKeyLookup, verifyAccessToken } from "./auth";

const ISSUER = "https://project.supabase.co/auth/v1";
const NOW_SECONDS = 1_800_000_000;

const signingKeys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
]);
const otherKeys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
]);
const publicJwk = await crypto.subtle.exportKey("jwk", signingKeys.publicKey);

function base64url(data: string | ArrayBuffer) {
  return Buffer.from(typeof data === "string" ? data : new Uint8Array(data)).toString("base64url");
}

async function signToken(
  claims: Record<string, unknown>,
  { privateKey = signingKeys.privateKey, kid = "key-1", alg = "ES256" } = {}
) {
  const header = base64url(JSON.stringify({ alg, typ: "JWT", kid }));
  const payload = base64url(
    JSON.stringify({
      iss: ISSUER,
      aud: "authenticated",
      sub: "member-1",
      exp: NOW_SECONDS + 3600,
      ...claims,
    })
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(`${header}.${payload}`)
  );
  return `${header}.${payload}.${base64url(signature)}`;
}

const options = {
  issuer: ISSUER,
  nowSeconds: NOW_SECONDS,
  lookupKey: async (kid: string) => (kid === "key-1" ? publicJwk : undefined),
};

describe("verifyAccessToken", () => {
  it("accepts a member's token signed by the project key", async () => {
    expect(await verifyAccessToken(await signToken({}), options)).toBe(true);
  });

  it("rejects an expired token", async () => {
    expect(await verifyAccessToken(await signToken({ exp: NOW_SECONDS - 1 }), options)).toBe(false);
  });

  it("rejects a token for another audience", async () => {
    expect(await verifyAccessToken(await signToken({ aud: "anon" }), options)).toBe(false);
  });

  it("rejects a token from another issuer", async () => {
    const token = await signToken({ iss: "https://other.supabase.co/auth/v1" });
    expect(await verifyAccessToken(token, options)).toBe(false);
  });

  it("rejects a token signed by a different key", async () => {
    const token = await signToken({}, { privateKey: otherKeys.privateKey });
    expect(await verifyAccessToken(token, options)).toBe(false);
  });

  it("rejects a token whose key id is not in the key set", async () => {
    expect(await verifyAccessToken(await signToken({}, { kid: "unknown" }), options)).toBe(false);
  });

  it("rejects a token that does not claim ES256", async () => {
    expect(await verifyAccessToken(await signToken({}, { alg: "HS256" }), options)).toBe(false);
  });

  it("rejects a token whose payload was changed after signing", async () => {
    const [header, , signature] = (await signToken({})).split(".");
    const forgedPayload = base64url(
      JSON.stringify({
        iss: ISSUER,
        aud: "authenticated",
        sub: "member-2",
        exp: NOW_SECONDS + 3600,
      })
    );
    expect(await verifyAccessToken(`${header}.${forgedPayload}.${signature}`, options)).toBe(false);
  });

  it("rejects malformed tokens", async () => {
    for (const token of ["", "not-a-jwt", "a.b.c", "a.b"]) {
      expect(await verifyAccessToken(token, options)).toBe(false);
    }
  });
});

describe("createKeyLookup", () => {
  const jwksUrl = "https://project.supabase.co/auth/v1/.well-known/jwks.json";
  const jwksResponse = (kids: string[]) =>
    new Response(JSON.stringify({ keys: kids.map((kid) => ({ ...publicJwk, kid })) }));

  it("fetches the key set once and answers later lookups from memory", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async () => jwksResponse(["key-1"]));
    const lookupKey = createKeyLookup(jwksUrl, { fetchFn, nowMs: () => 0 });

    expect(await lookupKey("key-1")).toMatchObject({ kid: "key-1", x: publicJwk.x });
    expect(await lookupKey("key-1")).toMatchObject({ kid: "key-1" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(jwksUrl);
  });

  it("refetches for an unknown key id, so a rotated key is picked up", async () => {
    let now = 0;
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jwksResponse(["key-1"]))
      .mockResolvedValueOnce(jwksResponse(["key-1", "key-2"]));
    const lookupKey = createKeyLookup(jwksUrl, { fetchFn, nowMs: () => now });

    await lookupKey("key-1");
    now = 60_000;
    expect(await lookupKey("key-2")).toMatchObject({ kid: "key-2" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("does not refetch for unknown key ids more than once a minute", async () => {
    let now = 0;
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async () => jwksResponse(["key-1"]));
    const lookupKey = createKeyLookup(jwksUrl, { fetchFn, nowMs: () => now });

    await lookupKey("key-1");
    now = 10_000;
    expect(await lookupKey("forged")).toBeUndefined();
    expect(await lookupKey("forged")).toBeUndefined();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("answers lookups that arrive while the first fetch is in flight", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async () => jwksResponse(["key-1"]));
    const lookupKey = createKeyLookup(jwksUrl, { fetchFn, nowMs: () => 0 });

    const [first, second] = await Promise.all([lookupKey("key-1"), lookupKey("key-1")]);

    expect(first).toMatchObject({ kid: "key-1" });
    expect(second).toMatchObject({ kid: "key-1" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("finds no key when the key set cannot be fetched", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response("down", { status: 503 }));
    const lookupKey = createKeyLookup(jwksUrl, { fetchFn, nowMs: () => 0 });

    expect(await lookupKey("key-1")).toBeUndefined();
  });
});
