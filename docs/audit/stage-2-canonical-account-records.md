# Stage 2 Canonical Account Records

Date: 2026-07-25

This stage adds a canonical account read model inside the existing Chrome MV3 extension. It does not introduce a second application, server, database, or framework.

## Storage And Migration

- `accountRecordsV2` is the canonical root: `{ schemaVersion: 2, items, updatedAt }`.
- Account IDs use the shared `normalizeAccountId()` implementation and invalid emails are discarded.
- Service Worker startup reconstructs canonical records from the existing custom email pool, account run history, membership results, credential backups, and the three channel usage maps.
- Migration is idempotent and does not mutate or delete any legacy key.
- `accountRecordsV2MigrationBackupV1` records the pre-migration canonical root before the first Repository write. The legacy sources remain in place as the primary migration fallback.
- Legacy `pixRedeem*` usage continues to map only to UPI compatibility state. Canonical PIX reads only `pixChannelRedeem*` state.

## Ownership Boundaries

- `shared/account-record-schema.js` owns account ID, status, timestamp, record, and channel normalization.
- `background/account-record-migration.js` owns read-only reconstruction from existing storage shapes.
- `background/account-repository.js` is the only production module that writes `accountRecordsV2`.
- `background/account-lifecycle-service.js` separates account validity, trial eligibility, membership, and access-token state.
- `shared/account-compatibility-adapter.js` projects canonical records back to the existing membership row shape.
- `sidepanel/account-records-membership-state-sync.js` consumes the canonical projection while allowing newer in-flight legacy results to override stale projected fields.

The existing account display, Free/Plus groups, exports, deletion tombstones, manual actions, and channel-specific redemption controls remain active. Sidepanel does not write canonical storage directly.

## Lifecycle Rules

- Network errors, timeouts, and HTTP 5xx preserve the current AT and remain retryable.
- Only explicit 401 or equivalent invalid-token evidence marks an AT invalid.
- Missing AT and invalid AT remain different states.
- An unverified replacement AT never overwrites the old AT.
- A deactivated account remains recorded, clears its confirmed unusable AT, stops retries, and cannot redeem.
- Free membership does not imply an invalid account.

## Verification

- Focused account tests: 42 passed.
- Full unit tests: 348 passed, 0 failed, 0 skipped.
- Syntax: 346 tracked JS/CJS/MJS files passed.
- Audits: smoke, removed-network, and phone/SMS audits passed.
- Manifest: all 35 referenced runtime files exist.
- Sensitive scan: no private-key, AWS-key, OpenAI-key, or long Bearer-token pattern found.
- CodeGraph: initialized and synchronized; 348 indexed files, 6,572 nodes, 25,805 edges.
- Packaging: intentionally skipped for this stage per the staged execution instruction.

The smoke audit retains the existing non-failing warning that `background.js` exceeds the general 8000-line warning threshold; it remains below the enforced 15400-line limit, which was not changed.
