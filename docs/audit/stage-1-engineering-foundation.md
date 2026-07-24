# Stage 1 Engineering Foundation

Date: 2026-07-25

This stage fixes the extracted project's three enforced size failures without changing their limits or removing behavior.

## Responsibility Splits

- `sidepanel/prompt-preferences.js` owns prompt dismissal and contribution-content version persistence.
- `sidepanel/download-service.js` now owns download timestamp, extension, and filename normalization.
- `background/steps/upi-redeem/free-entry-cleanup.js` owns successful redemption cleanup projections for email and CDK pools.
- `background/steps/upi-redeem/submission-response.js` owns remote response parsing, bounded error extraction, HTML detection, and explicit access-token-expiry payload classification.

All four modules have production callers, load-order checks, size guards, and focused tests. The UPI, IDEAL, and PIX state model is unchanged.

## Commands

`package.json` now provides:

```text
npm run syntax
npm test
npm run audit
npm run check
npm run package
```

The syntax command checks every Git-tracked JS/CJS/MJS file. The package command builds a loadable ZIP from an explicit runtime allowlist and verifies Manifest, Background, Sidepanel JS, and Sidepanel CSS references before compression.

## CI

`.github/workflows/ci.yml` runs on Windows with Node 22 and executes `npm ci`, syntax, tests, audits, package creation, and `git diff --check`.

## Security

The release allowlist excludes project tooling, Git metadata, local configuration, account history exports, logs, backups, caches, and generated release artifacts. It refuses to package a Manifest containing an extension `key`.

## Verification Results

- `npm ci`: passed, 0 vulnerabilities.
- `npm run syntax`: 334 tracked JS/CJS/MJS files passed.
- `npm test`: 330 passed, 0 failed, 0 skipped (312 original + 4 baseline + 14 stage 1 tests).
- `npm run audit`: smoke, removed-network, and phone/SMS audits passed.
- `npm run check`: passed end to end.
- Enforced file sizes: sidepanel app controller 7849/7850, Free entry 535/580, channel submission 1849/1900.
- `npm run package`: generated 252 runtime files in `release-artifacts/cdk-redeem-only-extension-v1.0.14.zip`.
- ZIP SHA-256: `B7B1C2C3C52D062690EC6CD6D8D333019EE667D6AAA987B51A8C7CC71F8CB23A`.
- ZIP reverse audit: 0 forbidden entries; required Manifest and runtime modules present.
- Edge package smoke: MV3 Service Worker started, Sidepanel returned 200 with title `CDK Redeem Only V1.0.14`, and no page or console errors were captured.

The smoke audit retains one non-failing warning: `background.js` is 15112 lines, above the general 8000-line warning level but below its enforced 15400-line guard.
