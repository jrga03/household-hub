# Security Threat Model

## Overview

This document outlines the security threats, attack vectors, mitigations, and security boundaries for Household Hub. Understanding these risks is critical for making informed architectural decisions and implementing appropriate safeguards.

**Last Updated**: 2024-10-14
**Related Documents**:

- [RLS-POLICIES.md](./RLS-POLICIES.md) - Database access control
- [R2-BACKUP.md](./R2-BACKUP.md) - Backup security
- [DECISIONS.md](./DECISIONS.md#security-decisions) - Security decisions

---

## Threat Actors

### 1. External Attackers

- **Motivation**: Data theft, credential harvesting, service disruption
- **Capabilities**: Network access, public endpoints, social engineering
- **Assets Targeted**: User credentials, financial data, session tokens

### 2. Compromised User Account

- **Motivation**: Access to household financial data
- **Capabilities**: Valid credentials, authorized access to some data
- **Assets Targeted**: All household data visible to that user

### 3. Malicious Insider (Household Member)

- **Motivation**: Unauthorized data modification or export
- **Capabilities**: Valid credentials, physical device access
- **Assets Targeted**: Other users' personal data, audit trail manipulation

### 4. Third-Party Services

- **Motivation**: Data collection, service improvement
- **Capabilities**: Access to data sent to their APIs
- **Assets Targeted**: Any data sent to Supabase, Cloudflare, Sentry

---

## Attack Vectors & Mitigations

### 1. Cross-Site Scripting (XSS)

**Attack Scenario**:

- Attacker injects malicious script via transaction description field
- Script executes in victim's browser, stealing session tokens
- Attacker gains full access to victim's account

**Current Mitigations**:

- React's built-in XSS protection (automatic escaping)
- Input sanitization on all user-generated content
- Content Security Policy (CSP) headers

**Current CSP Configuration**:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline'; ⚠️ RISK: Allows inline scripts
  style-src 'self' 'unsafe-inline';
  connect-src 'self' https://*.supabase.co https://*.cloudflare.com;
  img-src 'self' data: https:;
  font-src 'self' data:;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
```

**⚠️ Known Weakness**: `unsafe-inline` for scripts

- **Risk**: Allows inline event handlers and script blocks
- **Justification**: Required for Vite HMR in development
- **Mitigation Plan**:
  - Production build uses hash-based CSP
  - Vite generates script hashes at build time
  - Remove `unsafe-inline` in production deployment

**Additional Protections**:

- DOMPurify for rich text (if implemented)
- No `dangerouslySetInnerHTML` usage
- Strict TypeScript types prevent unsafe operations

**Related**: [DECISIONS.md](./DECISIONS.md) - Decision #74 (a11y testing includes XSS vectors)

---

### 2. Cross-Site Request Forgery (CSRF)

**Attack Scenario**:

- User visits attacker's website while logged into Household Hub
- Attacker's site makes unauthorized requests to Supabase
- Transactions created/modified without user consent

**Current Mitigations**:

- **SameSite Cookies**: Supabase uses `SameSite=Lax` on auth cookies
- **Authorization Headers**: All API calls use `Authorization: Bearer <token>` header (not cookies)
- **Origin Validation**: Cloudflare Workers verify request origin
- **No State-Changing GET**: All mutations use POST/PUT/DELETE

**Why This Works**:

- Bearer tokens cannot be sent cross-origin by browser
- `Authorization` header requires explicit JavaScript code
- Attacker cannot access token from different origin

**⚠️ Edge Case**: If we add cookie-based auth later

- **Risk**: Traditional CSRF applies
- **Mitigation**: Implement CSRF tokens for any cookie-based endpoints

---

### 3. Service Worker Poisoning

**Attack Scenario**:

- Attacker compromises CDN or performs MITM attack
- Malicious service worker installed
- Service worker intercepts all requests, steals tokens/data
- Persists across page reloads

**Current Mitigations**:

- **HTTPS Enforcement**: Service workers only work on HTTPS
- **Subresource Integrity (SRI)**: Hash verification on critical scripts
- **Service Worker Scope**: Limited to `/` only, no wildcards
- **Update Strategy**: Version-based cache busting

**Service Worker Update Flow**:

```javascript
// sw.js
const VERSION = "v1.2.3"; // Updated on each release
const CACHE_NAME = `household-hub-${VERSION}`;

// Force update on version change
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    })
  );
});
```

**Rollback Procedure**:

1. Detect malicious behavior via Sentry error rate spike
2. Deploy clean service worker with cache-busting version
3. Force unregister old worker via server-sent update flag
4. Users refresh to get clean worker

**⚠️ Known Risk**: 24-hour cache before update check

- **Mitigation**: Critical security patches force immediate reload
- **Monitoring**: Sentry alerts on unusual service worker errors

---

### 4. Credential Discovery & Harvesting

**Attack Scenario**:

- Attacker finds service keys in client bundle
- Attacker gains service_role access to Supabase
- Full database access, bypass RLS

**Current Mitigations**:

- **Environment Variables**: Keys stored in `.env` (not committed)
- **Build-Time Checks**: CI fails if secrets found in `dist/`
- **Separate Keys**: Anon key (client) vs Service key (server only)
- **Worker Isolation**: Service keys only in Cloudflare Workers

**CI Security Check** (see `.github/workflows/security-check.yml`):

```bash
# Scan build output for any service keys
if grep -r "service_role\|SUPABASE_SERVICE_KEY" dist/; then
  echo "❌ Service key detected in build output!"
  exit 1
fi
```

**Key Separation**:

- `SUPABASE_ANON_KEY`: Safe for client, has RLS restrictions
- `SUPABASE_SERVICE_KEY`: Never exposed, Worker-only, bypasses RLS

**⚠️ Risk**: Developer accidentally logs service key

- **Mitigation**: Eslint rule forbids `console.log` in production
- **Detection**: Sentry scrubs tokens from error logs

---

### 5. Data Exfiltration from Backups

**Attack Scenario**:

- Attacker gains access to R2 bucket
- Downloads encrypted backups
- Brute-forces weak encryption key
- Obtains all household financial data

**Current Mitigations** (See [R2-BACKUP.md](./R2-BACKUP.md)):

- **Phase A**: Manual export only (no cloud backups)
- **Phase B**: Client-side encryption before upload
  - AES-GCM 256-bit encryption
  - Auth-derived key using PBKDF2 (100k iterations)
  - Unique IV per backup
- **Worker Authorization**: JWT verification before signed URL generation
- **Per-User Keys**: Each user's backups encrypted with unique key

**Key Derivation** (Phase B):

```typescript
// Derive encryption key from user's auth session
const keyMaterial = jwt.access_token + jwt.user.id;
const baseKey = await crypto.subtle.importKey('raw', keyMaterial, 'PBKDF2', ...);
const encryptionKey = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt: userId, iterations: 100000, hash: 'SHA-256' },
  baseKey,
  { name: 'AES-GCM', length: 256 },
  ...
);
```

**R2 Access Control**:

- No public bucket access
- Signed URLs expire in 1 hour
- Worker validates user owns requested backup
- Path enforcement: `backups/{userId}/...` only

**⚠️ Known Limitation**: Key rotates when user changes password

- **Impact**: Old backups become unreadable
- **Mitigation**: Re-encrypt backups on password change (Phase C)

**Related**: [DECISIONS.md](./DECISIONS.md) - Decision #69 (backup encryption)

---

### 6. Compromised Account Blast Radius

**Attack Scenario**:

- Attacker obtains user's credentials (phishing, password reuse)
- Logs in as legitimate user
- Accesses all household financial data
- Modifies/deletes transactions

**Blast Radius Analysis**:

- ✅ **Can Access**: All household transactions, accounts, budgets
- ✅ **Can Modify**: Household transactions (via RLS UPDATE policy)
- ✅ **Can Delete**: Only own transactions (RLS DELETE policy)
- ❌ **Cannot Access**: Other users' personal transactions
- ❌ **Cannot Bypass**: Audit trail (events table is append-only)

**Damage Limitation**:

- **Audit Trail**: Complete history in `transaction_events` table
  - Attacker cannot delete events (no DELETE policy)
  - Can reconstruct state before attack
- **RLS Enforcement**: Cannot escalate to service_role access
- **Event Correlation**: Can identify suspicious device_id patterns

**Detection Signals**:

- Multiple device logins from different IPs
- Bulk deletion attempts
- Unusual transaction patterns (ML Phase C)
- Failed RLS policy checks spike

**Recovery Procedure**:

1. Identify compromised account via audit logs
2. Force password reset + session invalidation
3. Review `transaction_events` for unauthorized changes
4. Rollback using event sourcing to pre-attack state
5. Notify household members

**⚠️ Current Gap**: No rate limiting on login attempts

- **Risk**: Brute-force attack feasible
- **Mitigation Plan**: Add Cloudflare rate limiting (Phase B)

**Related**: [RLS-POLICIES.md](./RLS-POLICIES.md) - Policies limit damage

---

### 7. Supply Chain Attacks

**Attack Scenario**:

- Malicious dependency published to npm
- Backdoor steals tokens/data during build or runtime
- Data exfiltrated to attacker-controlled server

**Current Mitigations**:

- **Lockfile**: `pnpm-lock.yaml` ensures reproducible builds
- **Audit**: `pnpm audit` in CI (fails on high/critical)
- **Dependency Review**: Manual review of new dependencies
- **Minimal Dependencies**: Keep dependency count low

**High-Risk Dependencies**:

- `@supabase/supabase-js`: Database access (critical)
- `dexie`: IndexedDB access (critical)
- `zod`: Validation (medium - runtime only)
- `react-hook-form`: Form handling (low risk)

**Mitigation Strategy**:

- Pin exact versions in package.json
- Review changelogs before updating
- Test all updates in staging first
- Monitor Dependabot/Snyk alerts

---

## Data Classification & Protection

### Financial Data (HIGH)

- **Includes**: Transactions, account balances, budgets
- **Protection**:
  - RLS policies enforce access control
  - Encrypted in transit (HTTPS)
  - Encrypted at rest (Phase B backups)
  - Audit trail for all changes

### User Credentials (CRITICAL)

- **Includes**: Passwords, session tokens, JWT
- **Protection**:
  - Never stored in application code
  - Supabase Auth handles password hashing (bcrypt)
  - JWT signed with HS256, verified on each request
  - No password reset without email confirmation

### Audit Logs (MEDIUM)

- **Includes**: transaction_events table, device_id, timestamps
- **Protection**:
  - Append-only (no DELETE policy)
  - Household-scoped visibility
  - Cannot be modified by compromised account

### Device Identifiers (LOW)

- **Includes**: device_id from FingerprintJS
- **Protection**:
  - Stored in IndexedDB and localStorage
  - Used for sync only, not authentication
  - Privacy not a concern (private household app)

**Related**: [DATABASE.md](./DATABASE.md) - Data model

---

## Security Boundaries

### Trust Boundaries

```
┌─────────────────────────────────────────────────┐
│ Untrusted Zone (Client Browser)                │
│  - User input (transactions, descriptions)     │
│  - Service Worker (can be poisoned)            │
│  - IndexedDB (user-modifiable)                 │
│  - LocalStorage (user-modifiable)              │
└──────────────────┬──────────────────────────────┘
                   │ HTTPS + JWT
                   ▼
┌─────────────────────────────────────────────────┐
│ Trusted Zone (Cloudflare Workers)              │
│  - JWT verification                             │
│  - R2 access control                            │
│  - Service key storage                          │
└──────────────────┬──────────────────────────────┘
                   │ Authenticated
                   ▼
┌─────────────────────────────────────────────────┐
│ Highly Trusted Zone (Supabase)                 │
│  - RLS enforcement                              │
│  - Database integrity                           │
│  - Authentication                               │
└─────────────────────────────────────────────────┘
```

### Network Boundaries

- **Client ↔ Supabase**: HTTPS with TLS 1.3
- **Client ↔ Cloudflare Workers**: HTTPS with TLS 1.3
- **Workers ↔ Supabase**: HTTPS (backend to backend)
- **Workers ↔ R2**: Internal (same Cloudflare account)

---

## Security Testing Strategy

### Automated Tests (CI)

- [x] Dependency vulnerability scanning (`pnpm audit`)
- [x] Service key leak detection (grep build output)
- [ ] OWASP ZAP baseline scan (Phase B)
- [ ] Lighthouse security audit (Phase B)

### Manual Tests (Pre-Release)

- [ ] XSS injection in all input fields
- [ ] CSRF attempt using separate domain
- [ ] RLS bypass attempts (direct API calls)
- [ ] Session hijacking simulation
- [ ] Backup encryption/decryption round-trip

### Penetration Testing (Optional Phase C)

- [ ] Third-party security audit
- [ ] Bug bounty program

**Related**: [TESTING-PLAN.md](./TESTING-PLAN.md) - Security test cases

---

## Incident Response Plan

### Detection

1. **Sentry Alerts**: Error rate spike, unusual patterns
2. **Audit Log Review**: Suspicious device_id, bulk changes
3. **User Reports**: Unauthorized transactions

### Response Steps

1. **Isolate**: Revoke compromised session tokens
2. **Investigate**: Review audit logs, identify scope
3. **Contain**: Block attacker's IP via Cloudflare
4. **Recover**: Rollback using event sourcing
5. **Notify**: Inform affected users
6. **Remediate**: Patch vulnerability, deploy fix

### Communication

- **Internal**: Household members via in-app notification
- **External**: No public disclosure (private app)

---

## Security Roadmap

### Phase A (MVP)

- [x] RLS policies enforced
- [x] HTTPS everywhere
- [x] JWT authentication
- [x] CI security checks
- [x] Input sanitization

### Phase B

- [ ] Backup encryption (auth-derived keys)
- [ ] Rate limiting on auth endpoints
- [ ] CSP hash-based policy (remove unsafe-inline)
- [ ] Security headers audit
- [ ] OWASP ZAP scanning

### Phase C

- [ ] Optional passphrase encryption
- [ ] Multi-factor authentication
- [ ] Anomaly detection (ML-based)
- [ ] Third-party security audit
- [ ] Advanced audit log analysis

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/platform/going-into-prod#security)
- [CSP Best Practices](https://web.dev/csp/)
- [JWT Security Best Practices](https://tools.ietf.org/html/rfc8725)

---

## Changelog

| Date       | Change                        | Author |
| ---------- | ----------------------------- | ------ |
| 2024-10-14 | Initial security threat model | System |

---

**⚠️ Important**: This is a living document. Update as new threats are discovered or mitigations are implemented.
