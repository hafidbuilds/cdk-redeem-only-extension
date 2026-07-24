# Stage 4: CDK Idempotency and Remote Effect Protection

## Implemented

- Account resource locks use the canonical normalized account ID.
- CDK resource locks include the normalized channel and `fnv1a_*` fingerprint; the complete CDK is never written to task events or ordinary logs.
- `externalEffectsV1` and `redeemAttemptsV1` are written only by `background/external-effect-ledger.js`.
- Redeem dispatch persists `prepared` before the request, records `dispatched` before fetch, and records `acknowledged` or `confirmed` only after explicit remote acceptance.
- Network, timeout, page-close, and Service Worker loss paths remain `unknown`; an unknown effect cannot be dispatched again.
- Service Worker recovery performs a query-only status refresh through the existing redeem status service. Confirmed and explicitly failed results resolve the task and release locks; unresolved results become `manual_review` and retain locks.
- UPI, IDEAL, and PIX keep separate CDK pools, usage, effects, and failure state. A matching CDK fingerprint in another channel does not block a dispatch.
- Stable `Idempotency-Key` headers are sent for tracked redeem submissions.

## Verification

- Targeted Stage 4 tests: `22/22` passed.
- Full unit tests: `396/396` passed with `node --test --test-concurrency=1 scripts/test-*.cjs`.
- Syntax: `370` tracked JavaScript files passed `scripts/check-syntax.mjs`.
- Audits: smoke, removed-network, and phone/SMS audits passed. The existing warning for `background.js` being over 8,000 lines remains; no threshold was changed.
- No release package was built in this stage.
