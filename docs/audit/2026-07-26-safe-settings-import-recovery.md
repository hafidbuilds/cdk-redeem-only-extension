# Safe settings import recovery

## Problem

Schema V2 safe exports retained a redacted account run history and only a membership count summary. Import treated `containsSensitiveRuntimeData: false` as a reason to ignore all runtime data, so importing a safe bundle restored settings but left account identities and membership groups empty.

## Implementation

- Safe exports now include a whitelisted membership read model containing account identity, membership status, channel, timestamps, and status metadata only.
- Passwords, 2FA material, access tokens, CDKs, cookies, private keys, and provider secrets remain excluded.
- Safe imports restore the sanitized membership read model and sanitized account run history.
- Summary-only legacy safe exports restore account history but do not fabricate membership rows from aggregate counts.
- Runtime imports synchronously refresh the canonical account read model before broadcasting the completed import state.
- The canonical migration keeps existing records authoritative during ordinary background synchronization. During an explicit settings import, membership rows present in the bundle instead restore their lifecycle state and clear stale Free/Plus deletion tombstones for those rows only.
- Explicit imported credential fields update the canonical record, including an intentionally blank token after confirmed invalidation. Password, 2FA, and other credential fields absent from the bundle remain unchanged, and accounts absent from the import are not removed.

## Legacy recovery

`multipage-settings-20260725-084547.json` predates the redacted membership detail format, so its `freeCount: 49` cannot identify the 49 accounts by itself. A separate recovered sensitive bundle was generated from the persisted `test2` task ledger and pre-import backup. It contains 100 email-pool entries and 49 verified Free rows; one remotely confirmed invalid access token remains cleared.

## Verification

- Focused settings transfer and migration tests cover safe export redaction, safe detail import, summary-only legacy import, and account read-model synchronization.
- Live `test2` verification after extension reload and re-import rendered 49 Free rows and loaded 100 email-pool entries. Canonical storage contained 49 matching Free records, no stale Free deletion tombstones, and 48 complete access tokens; the remaining row is shown as missing AT.
- Final verification passed 435/435 Node tests, syntax checks for 383 tracked scripts, all three audits, 24 Manifest file references with no missing files, and tracked-source credential scans. The smoke audit retains the pre-existing `background.js` size warning.
