# Safe settings import recovery

## Problem

Schema V2 safe exports retained a redacted account run history and only a membership count summary. Import treated `containsSensitiveRuntimeData: false` as a reason to ignore all runtime data, so importing a safe bundle restored settings but left account identities and membership groups empty.

## Implementation

- Safe exports now include a whitelisted membership read model containing account identity, membership status, channel, timestamps, and status metadata only.
- Passwords, 2FA material, access tokens, CDKs, cookies, private keys, and provider secrets remain excluded.
- Safe imports restore the sanitized membership read model and sanitized account run history.
- Summary-only legacy safe exports restore account history but do not fabricate membership rows from aggregate counts.
- Runtime imports synchronously refresh the canonical account read model before broadcasting the completed import state.

## Legacy recovery

`multipage-settings-20260725-084547.json` predates the redacted membership detail format, so its `freeCount: 49` cannot identify the 49 accounts by itself. A separate recovered sensitive bundle was generated from the persisted `test2` task ledger and pre-import backup. It contains 100 email-pool entries and 49 verified Free rows; one remotely confirmed invalid access token remains cleared.

## Verification

- Focused settings transfer and migration tests cover safe export redaction, safe detail import, summary-only legacy import, and account read-model synchronization.
- Full Node tests, syntax checks, smoke audit, manifest references, and sensitive-data scans must pass before commit.
