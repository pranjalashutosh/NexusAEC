# packages/email-providers — Gmail/Outlook adapters

Global rules: root `CLAUDE.md`. Architecture:
`docs/architecture/email-integration.md` (adapter pattern, data normalization,
inbox merging, smart draft routing).

## Adapters & OAuth

- Request helpers: Gmail uses `gmailRequest<T>()`
  (`src/adapters/gmail-adapter.ts`); Outlook uses `graphRequest<T>()`
  (`src/adapters/outlook-adapter.ts`).
- OAuth: `GoogleOAuthProvider` requires `prompt: 'consent'` to receive refresh
  tokens.
- Incremental sync: Gmail uses `getProfileHistoryId()` + `fetchHistory()`;
  Outlook uses `hasNewEmailsSince()` for polling.

## Validation

- OAuth flows cannot be unit-tested — validate via a manual API integration
  test.
