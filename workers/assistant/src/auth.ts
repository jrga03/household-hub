export type KeyLookup = (kid: string) => Promise<JsonWebKey | undefined>;

interface VerifyOptions {
  lookupKey: KeyLookup;
  issuer: string;
  nowSeconds: number;
}

interface TokenHeader {
  alg?: unknown;
  kid?: unknown;
}

interface TokenClaims {
  exp?: unknown;
  aud?: unknown;
  iss?: unknown;
}

const ES256 = { name: "ECDSA", namedCurve: "P-256" };
const MIN_REFETCH_INTERVAL_MS = 60_000;

interface KeyLookupDeps {
  fetchFn?: typeof fetch;
  nowMs?: () => number;
}

/** Keeps the project's signing keys in memory; refetches for an unknown key id at most once a minute. */
export function createKeyLookup(
  jwksUrl: string,
  { fetchFn = fetch, nowMs = Date.now }: KeyLookupDeps = {}
): KeyLookup {
  let keysById = new Map<string, JsonWebKey>();
  let lastFetchMs: number | undefined;

  async function refresh() {
    lastFetchMs = nowMs();
    try {
      const response = await fetchFn(jwksUrl);
      if (!response.ok) return;
      const body: unknown = await response.json();
      if (!isObject(body) || !Array.isArray(body.keys)) return;
      keysById = new Map(
        body.keys
          .filter(
            (key): key is JsonWebKey & { kid: string } =>
              isObject(key) && typeof key.kid === "string"
          )
          .map((key) => [key.kid, key])
      );
    } catch {
      // Unreachable or malformed: keep the keys we have.
    }
  }

  return async (kid) => {
    const canRefetch =
      lastFetchMs === undefined || nowMs() - lastFetchMs >= MIN_REFETCH_INTERVAL_MS;
    if (!keysById.has(kid) && canRefetch) await refresh();
    return keysById.get(kid);
  };
}

function base64urlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function decodeJson(segment: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64urlToBytes(segment)));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function verifyAccessToken(token: string, options: VerifyOptions): Promise<boolean> {
  const [encodedHeader, encodedClaims, encodedSignature, ...rest] = token.split(".");
  if (!encodedHeader || !encodedClaims || !encodedSignature || rest.length > 0) return false;

  let header: TokenHeader;
  let claims: TokenClaims;
  try {
    const decodedHeader = decodeJson(encodedHeader);
    const decodedClaims = decodeJson(encodedClaims);
    if (!isObject(decodedHeader) || !isObject(decodedClaims)) return false;
    header = decodedHeader;
    claims = decodedClaims;
  } catch {
    return false;
  }

  if (header.alg !== "ES256" || typeof header.kid !== "string") return false;
  if (typeof claims.exp !== "number" || claims.exp <= options.nowSeconds) return false;
  if (claims.aud !== "authenticated" || claims.iss !== options.issuer) return false;

  const jwk = await options.lookupKey(header.kid);
  if (!jwk) return false;

  try {
    const key = await crypto.subtle.importKey("jwk", jwk, ES256, false, ["verify"]);
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      base64urlToBytes(encodedSignature),
      new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`)
    );
  } catch {
    return false;
  }
}
