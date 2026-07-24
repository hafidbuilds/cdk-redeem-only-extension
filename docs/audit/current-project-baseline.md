# Current Project Baseline

Date: 2026-07-25 (Asia/Shanghai)

Scope: extracted `CDK Redeem Only` Chrome Manifest V3 extension, version `1.0.14`.

## Repository State

- Working directory: `C:\Users\Z1803\Downloads\cdk-redeem-only-extension-v1.0.14-working-20260725`
- The extracted directory had no `.git` directory.
- `.gitignore` excludes local configuration, account history, logs, generated exports, release artifacts, backups, caches, worktrees, and `.codegraph`.
- Pre-change Git baseline: `e19e09516c601ecab638a4ddac2a319bd6c465d8`.
- Tracked baseline: 405 files, including 322 JavaScript/CJS/MJS files and 78 `test-*.cjs` files.
- The expected Chinese document `项目完整链路说明.md` exists with the correct filename; no rename is required.

## Security Review

The pre-change scan checked for ignored runtime files, `.env` files, `config.json`, account history exports, startup logs, JWT-shaped values, Bearer tokens, and common API-key prefixes. No real runtime credentials or account data were found. Email matches outside tests and docs were example placeholders such as `name@gmail.com` and `admin@example.com`.

Operational endpoints and provider names remain in source because they are existing product configuration, not embedded credentials.

## Runtime Boundaries

- Manifest: Chrome MV3.
- Service worker: `background.js`.
- Side panel: `sidepanel/sidepanel.html`.
- State: `chrome.storage.session` for runtime state plus `chrome.storage.local` for persistent settings and durable results.
- Primary durable keys: `accountRunHistory`, `upiAccountCredentialBackups`, `upiCredentialMembershipCheckResults`, `autoRunRoundLogSnapshots`, `upiRedeemCdkeyUsage`, `idealRedeemCdkeyUsage`, and `pixChannelRedeemCdkeyUsage`.
- Sidepanel-only preference keys use `localStorage`, including theme, prompt dismissal, custom-email-pool backup, and Free export URL preference.

## Providers And Channels

The current provider registry exposes `icloud`, `icloud-api`, `gmail`, `hotmail-api`, `luckmail-api`, `cloudflare-temp-email`, `cloudmail`, `freemail`, `moemail`, `yydsmail`, and `outlook-email-plus`. Generator aliases also include `gmail-alias`, `custom-pool`, and matching API-provider generators.

The only canonical redeem channels are `upi`, `ideal`, and `pix`. Their canonical pool/usage fields are independent:

| Channel | Pool | Usage | Failure field |
| --- | --- | --- | --- |
| UPI | `upiRedeemCdkeyPoolText` | `upiRedeemCdkeyUsage` | `upiRedeemFailureCount` |
| IDEAL | `idealRedeemCdkeyPoolText` | `idealRedeemCdkeyUsage` | `idealRedeemFailureCount` |
| PIX | `pixChannelRedeemCdkeyPoolText` | `pixChannelRedeemCdkeyUsage` | `pixRedeemFailureCount` |

Legacy `pixRedeem*` pool aliases remain UPI compatibility input and are not canonical PIX storage.

## Message And Load Boundaries

Routes are grouped under `background/routes/` and dispatched by `background/router/message-dispatcher.js`. Existing message families cover state/settings import-export, workflow start/stop/reset/schedule, email and provider operations, account history, membership/eligibility/AT refresh, and CDK redeem/refresh/cancel/retry.

The complete service-worker load order is the ordered `importScripts` list in `background.js`. The critical dependency order is shared registries and bootstrap modules, then redeem state/API helpers, route groups and dispatcher, membership services, workflow/verification modules, UPI redeem submodules, provider utilities, and finally `content/activation-utils.js`.

The complete sidepanel load order is the ordered script list at the end of `sidepanel/sidepanel.html`. Shared state and formatting modules load before account modules; controllers load before `sidepanel-app-controller.js`; bootstrap and `sidepanel.js` load last. Static audit enforces these order constraints.

## Baseline Verification

Commands run before source modification:

```text
node --test scripts/test-*.cjs
node scripts/audit-smoke-tests.mjs
node scripts/audit-no-removed-network.mjs
node scripts/audit-no-phone-sms.mjs
node --check background.js
node --check sidepanel/sidepanel.js
node --check background/steps/upi-redeem.js
```

Results:

- Unit tests: 312 passed, 0 failed, 0 skipped.
- Removed-network audit: passed.
- Phone/SMS audit: passed.
- Direct syntax checks: passed.
- Smoke audit before Git initialization: failed on three Git-dependent checks plus the three size guards below.
- Smoke audit after Git initialization: Git-dependent checks passed; only the three size guards failed.

| File | Actual | Limit |
| --- | ---: | ---: |
| `sidepanel/sidepanel-app-controller.js` | 7909 | 7850 |
| `background/steps/upi-redeem/free-entry.js` | 603 | 580 |
| `background/steps/upi-redeem/channel-submission.js` | 1932 | 1900 |

`background.js` has 15110 lines and produces the existing warning for tracked source over 8000 lines, but remains below its enforced 15400-line guard.

## Frozen Fixtures

`scripts/fixtures/current-project-baseline.cjs` contains only fictional `example.com` accounts and fictional channel CDKs. `scripts/test-current-project-baseline.cjs` freezes:

- Free, UPI Plus, IDEAL Plus, PIX Plus, missing-AT, invalid-AT, and deactivated account shapes;
- current Free text export field order;
- UPI/IDEAL/PIX channel isolation;
- one-channel-only all-redeem selection behavior.
