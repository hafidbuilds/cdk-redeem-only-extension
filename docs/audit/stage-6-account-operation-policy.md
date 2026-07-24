# Stage 6: Unified Account Operation Policy

`sidepanel/membership-row-policy.js` now owns the operation decision contract for the existing account rows. `getOperationDecision` and `buildOperationDecisions` cover AT refresh, membership verification, UPI/IDEAL/PIX redeem, export, delete, retry, and stop. Every decision returns `allowed`, a stable `reasonCode`, and a readable `reason`; redeem decisions also carry the normalized channel.

`sidepanel/account-records-redeem-policy.js` exposes the same policy through the manager's existing wrapper. `account-records-display-model.js` attaches the policy result to each normalized display row as `operationDecisions`, so renderers can present the result without reimplementing eligibility, AT, account lock, daily-limit, or active-task checks. Existing channel state remains independent, including PIX.

The implementation reuses the current membership row, trial eligibility, redeem channel, and workflow modules. No second account list or write path was introduced.

Verification for this stage includes the existing membership, PIX, display model, manager, renderer, and workflow tests plus the new stable reason-code assertions.

Recorded gates: full unit tests `404/404`; syntax `375` tracked JavaScript files passed; smoke, removed-network, and phone/SMS audits passed with the existing `background.js` size warning; Manifest references `35/0`; CodeGraph `377` files, `6,839` nodes, `26,647` edges, up to date. Credential-shaped scan found no matches.
