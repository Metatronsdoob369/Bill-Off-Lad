# Security Specification — BillOff-Lading (`firestore.rules`)

## 1. Data Invariants
1. **Write-Only Public Ingress (`/leads/{leadId}`)**: Visitors on the validation and MVP landing page may only `create` documents in `/leads/{leadId}`. All `read` (`get`, `list`), `update`, and `delete` operations are strictly denied (`if false`) to prevent PII scraping or tampering.
2. **Strict 6-Key Schema Blueprint**: Every created lead document must contain all 6 required keys (`['email', 'timestamp', 'source', 'tier', 'channel', 'search_query']`) and no shadow keys (`hasAll` + `hasOnly`).
3. **Temporal Integrity**: `timestamp` must strictly equal `request.time` (`serverTimestamp()`). Client-spoofed past or future timestamps are rejected.
4. **Volumetric & Format Bounds**:
   - `leadId`: Valid document ID (`size() <= 128`, alphanumeric/hyphen/underscore).
   - `email`: String between 5 and 254 characters matching `^[^@\s]+@[^@\s]+\.[^@\s]+$`.
   - `source`: Must belong to the 6-value allowlist.
   - `tier`: Either `null` or one of the 3 locked pricing tier strings.
   - `channel`: Either `null` or a string with `size() <= 120`.
   - `search_query`: Either `null` or a string with `size() <= 100`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Shadow Field Injection**: `{ email: "dispatch@fleet.com", timestamp: request.time, source: "hero_inline", tier: null, channel: "direct", search_query: null, isAdmin: true }` -> `PERMISSION_DENIED` (`hasOnly` check fails).
2. **Missing Key**: `{ email: "dispatch@fleet.com", timestamp: request.time, source: "hero_inline" }` -> `PERMISSION_DENIED` (`hasAll` check fails).
3. **Invalid Email Regex**: `{ email: "not-an-email", timestamp: request.time, source: "hero_inline", tier: null, channel: null, search_query: null }` -> `PERMISSION_DENIED`.
4. **Overlong Email DoS**: `{ email: "a".repeat(300) + "@fleet.com", ... }` -> `PERMISSION_DENIED` (`size() <= 254` fails).
5. **Spoofed Past Timestamp**: `{ ..., timestamp: Timestamp.fromMillis(1600000000000) }` -> `PERMISSION_DENIED` (`timestamp == request.time` fails).
6. **Invalid Source Enum**: `{ ..., source: "scraped_bot_source" }` -> `PERMISSION_DENIED`.
7. **Invalid Pricing Tier Enum**: `{ ..., tier: "Free Forever Unlimited" }` -> `PERMISSION_DENIED`.
8. **Overlong Channel String**: `{ ..., channel: "x".repeat(121) }` -> `PERMISSION_DENIED` (`size() <= 120` fails).
9. **Overlong Search Query String**: `{ ..., search_query: "q".repeat(101) }` -> `PERMISSION_DENIED` (`size() <= 100` fails).
10. **Unauthorized Public Read (`get` / `list`)**: `getDoc(doc(db, 'leads', 'any'))` or `getDocs(collection(db, 'leads'))` -> `PERMISSION_DENIED`.
11. **Unauthorized Document Update**: `updateDoc(doc(db, 'leads', 'any'), { email: "hacked@fleet.com" })` -> `PERMISSION_DENIED`.
12. **Unauthorized Document Delete**: `deleteDoc(doc(db, 'leads', 'any'))` -> `PERMISSION_DENIED`.
