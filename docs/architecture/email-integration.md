# Email Integration Layer

> Abstracts Outlook and Gmail behind a unified `EmailProvider` interface.
> All provider data normalized to `StandardEmail`. See [overview](../../ARCHITECTURE.md).

---

## Unified Adapter Pattern

```
┌──────────────────────────────────────────────┐
│           Application Layer                   │
│  (UnifiedInboxService, SmartDraftService)     │
└──────────────────┬───────────────────────────┘
                   │ EmailProvider interface
         ┌─────────┴─────────┐
         ▼                   ▼
  ┌──────────────┐   ┌──────────────┐
  │OutlookAdapter│   │ GmailAdapter │
  │ Graph API    │   │ Gmail API    │
  │ OAuth + PKCE │   │ OAuth 2.0   │
  └──────┬───────┘   └──────┬───────┘
         ▼                   ▼
  Microsoft Graph      Google APIs
```

**EmailProvider interface methods:**
`fetchThreads`, `fetchUnread`, `createDraft`, `sendDraft`, `markRead`,
`markUnread`, `moveToFolder`, `applyLabel`, `getContacts`, `getCalendarEvents`

---

## Data Normalization

Provider-specific data is normalized to `StandardEmail`:

```typescript
// Microsoft Graph response → StandardEmail
{
  id: "OUTLOOK:AAMkAGI2T...",
  source: "OUTLOOK",
  providerMessageId: "AAMkAGI2T...",
  threadId: "OUTLOOK:AAMkAGI2T...",
  subject: "Project Update",
  from: { email: "john@example.com", name: "John Doe" },
  to: [...],
  receivedAt: "2026-01-09T10:00:00Z",
  isRead: false
}
```

**Benefits:** Single interface for all operations, easy to add providers, simplified
testing, consistent data shape.

---

## Unified Inbox Service

```
1. Poll all active adapters in parallel
   OutlookAdapter.fetchUnread() + GmailAdapter.fetchUnread()
         │
2. Normalize to StandardEmail[] (add source discriminator)
   [{ id: "OUTLOOK:123", ... }, { id: "GMAIL:456", ... }]
         │
3. Merge timelines by receivedAt (sort descending)
         │
4. Return unified StandardEmail[] (sorted, tagged with source)
```

---

## Smart Draft Routing

When user says "Reply to that email saying I'll join the meeting":

1. **Identify source** — Check original email's `source` field
2. **Route to adapter** — `source === "GMAIL"` → use `GmailAdapter`
3. **Create draft** — `GmailAdapter.createDraft({ ..., isPendingReview: true })`
4. **Return tagged draft** — `StandardDraft { id: "GMAIL:draft789", source: "GMAIL" }`

**Routing rules:**
- Replies: Use the same provider as the original email
- New emails (not replies): Default to OUTLOOK
- Dev mode fallback: GMAIL

The desktop app uses the `source` tag to know which provider sends the approved draft.
