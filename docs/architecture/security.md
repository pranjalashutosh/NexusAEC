# Security Architecture

> Five security layers: transport, authentication, encryption, privacy, and
> access control. See [overview](../../ARCHITECTURE.md) for system context.

---

## Security Layers

### Layer 1: Transport

- HTTPS/WSS for all network communication
- TLS 1.3 minimum
- Certificate pinning (mobile apps)
- LiveKit WebRTC: end-to-end encrypted (SRTP)

### Layer 2: Authentication

**OAuth 2.0 with PKCE:**
- Microsoft Graph: Authorization Code Flow + PKCE
  - Scopes: `Mail.Read`, `Mail.ReadWrite`, `Calendars.Read`
- Google APIs: Authorization Code Flow + PKCE
  - Scopes: `gmail.readonly`, `gmail.modify`, `calendar.readonly`
- Refresh tokens stored in secure storage (encrypted)

**JWT for Backend API:**
- Signed with HS256, payload: `{ userId, exp, iat }`, TTL: 1 hour
- Refresh via refresh token

### Layer 3: Data Encryption

**At rest (AES-256-GCM via `@nexus-aec/encryption`):**
- Master key from `ENCRYPTION_MASTER_KEY` env var
- Encrypted: OAuth tokens, user preferences, audit trail entries
- Platform storage: iOS/macOS Keychain, Android EncryptedSharedPreferences,
  Windows Credential Manager, Linux Secret Service API

**In transit:**
- LiveKit WebRTC: SRTP (end-to-end encrypted audio)
- HTTPS for all API calls
- No email content stored (Tier 1 ephemeral only)

### Layer 4: Privacy & PII

**Data minimization:**
- Email content: never stored (ephemeral only)
- Session state: 24h TTL in Redis
- Audit trail: 30-day default retention
- Knowledge base: only asset metadata, no user data

**PII filtering in logs (`@nexus-aec/logger`):**
- Filters: email addresses, names, message content
- Logs only: hashed user IDs, counts, durations

**User controls:**
- Privacy dashboard showing all stored data
- "Clear My Data" button
- OAuth revocation links
- Audit trail export (CSV/JSON)

### Layer 5: Authorization & Access Control

**Draft approval workflow (Safety-First):**
```
Voice: "Send a reply"
  → Agent creates draft (isPendingReview: true)
    → Desktop app shows draft for review
      → Approve → Send via adapter
      → Reject → Delete draft
```

**Confirmation verbosity (risk-based):**
| Risk | Action | Confirmation |
|------|--------|-------------|
| Low | Mark read | "Done" (no confirmation) |
| Medium | Flag, move | "Flagged 3 emails" (count) |
| High | Draft, delete | Require desktop approval |

**Undo window:** 24 hours. All actions in audit trail. Desktop app: undo
individual or batch. After 24h: finalized.

---

## Threat Model

| Threat | Mitigation |
|--------|-----------|
| OAuth token theft | Secure storage (Keychain etc.), never log tokens |
| MITM | TLS 1.3, certificate pinning, HTTPS everywhere |
| PII leak in logs | PII filtering via `@nexus-aec/logger` |
| Unauthorized email access | Scopes limited to read + draft, no send without approval |
| Session hijacking | JWT short TTL (1h), rotate on refresh |
| Email content exposure | Tier 1 ephemeral only, never persist bodies |
| Unintended actions | Confirmation verbosity, desktop approval, undo window |
| Credential stuffing | Rate limiting (100 req/min/user) |
