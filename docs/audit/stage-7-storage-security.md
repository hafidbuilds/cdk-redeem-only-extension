# Stage 7: Settings Migration, Storage, and Sensitive Data Security

## Implementation

- `background/bootstrap/settings-transfer-security.js` owns schema migration, recursive sensitive-field omission, safe runtime summaries, and bounded pre-import backups.
- `background/bootstrap/settings-transfer.js` keeps the existing settings import/export path and delegates those security operations; v1 bundles migrate to the current schema v2 idempotently, while future versions fail closed.
- Ordinary exports use `exportMode: safe` and `containsSensitiveRuntimeData: false`. Sensitive runtime data is exported only when the caller sends both `includeSensitiveRuntimeData: true` and `confirmed: true`.
- The existing sidepanel configuration menu now exposes a separate sensitive-backup action with a destructive confirmation dialog. Existing account export formats are unchanged.
- `background/bootstrap/state-store.js` sets `storage.session` to `TRUSTED_CONTEXTS`; content scripts continue using Background message routes rather than reading protected storage.
- Manifest permission purposes are documented in `docs/architecture/permission-map.md` without removing permissions used by current automation.

## Verification

Focused tests in `scripts/test-settings-migration.cjs` cover v1 to v2 migration, idempotency, future-version rejection, safe export omission, explicit sensitive export confirmation, and pre-import backup persistence. Existing settings route, transfer manager, and state-store tests remain active.

Recorded gates for this stage: focused settings and sidepanel tests passed; smoke audit passed with only the existing `background.js` size warning. Full unit, syntax, manifest, sensitive-data, and CodeGraph gates are run before the stage commit.
