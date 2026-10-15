import { createKeyLookup, verifyAccessToken, type KeyLookup } from "./auth";
import { handleRequest, type HandlerEnv } from "./handler";

interface AssistantEnv extends HandlerEnv {
  SUPABASE_URL: string;
}

// Kept for the isolate's lifetime, so most requests verify without fetching the key set.
let keyLookup: { jwksUrl: string; lookup: KeyLookup } | undefined;

function lookupFor(jwksUrl: string) {
  if (keyLookup?.jwksUrl !== jwksUrl) keyLookup = { jwksUrl, lookup: createKeyLookup(jwksUrl) };
  return keyLookup.lookup;
}

export default {
  fetch(request: Request, env: AssistantEnv) {
    const issuer = `${env.SUPABASE_URL}/auth/v1`;
    const lookupKey = lookupFor(`${issuer}/.well-known/jwks.json`);
    return handleRequest(request, env, {
      authorize: (token) =>
        verifyAccessToken(token, { lookupKey, issuer, nowSeconds: Math.floor(Date.now() / 1000) }),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      nowMs: Date.now,
    });
  },
};
