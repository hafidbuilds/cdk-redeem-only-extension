# Stage 5: Provider Definitions And Mail Baselines

## Scope

Stage 5 extends the existing `background/email/provider-registry.js` and verification flow. It does not add a second provider or mail service.

## Provider Definition

The registry now exposes `getProviderDefinition`, `listProviderDefinitions`, `normalizeProviderConfig`, `validateProviderConfig`, `redactProviderConfig`, and `testProviderConnection`. Definitions carry provider ID, display name, field/state keys, secret markers, defaults, normalization rules, capabilities, and dedicated-UI status. Existing Hotmail, 2925, iCloud, Gmail, and custom-mail managers remain dedicated UI providers. Background `getMailConfig` uses the canonical display name for shared providers.

Empty secret input can be normalized with a previous configuration so a settings save does not erase an existing key. Redacted configuration contains only a short preview and is suitable for status messages. Connection testing is an injected, side-effect-free entry point; it validates before invoking the existing provider-specific tester.

## Verification Mail Baseline

`background/verification/mail-baseline.js` stores only bounded metadata: request time, account/session scope, provider, message IDs, and stable FNV fingerprints. It never persists a full mail body. Resend requests establish `verificationMailBaseline` before the request and update the request timestamp after the page accepts it. Pollers receive consumed ID/fingerprint exclusions, while accepted results record a consumed marker after successful submission. Assurivo entries additionally carry their provider message ID/fingerprint into the existing custom-mail flow.

The existing timestamp, sender, subject, keyword, target-mailbox, resend, and provider-specific cursor rules remain authoritative. A network or provider error remains a transport/provider error; it is not translated into token invalidity.

## Verification

- Targeted Stage 5 tests: `15/15` (including existing verification regression tests).
- Full unit tests: `403/403`.
- Syntax: `372` tracked JavaScript files passed.
- Audits: smoke passed with the existing `background.js` size warning; removed-network and phone/SMS audits passed.
- Manifest references: `35` checked, `0` missing.
- CodeGraph: `377` files, `6,834` nodes, `26,572` edges, index up to date.
- Sensitive scan: only existing fake fixture/test secrets matched; no real credential-shaped value was added.
