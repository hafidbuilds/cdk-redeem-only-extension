# Stage 8: Limited Concurrency, Retry, and Circuit Isolation

`background/runtime/remote-operation-policy.js` is the shared policy for independent remote queries. It clamps concurrency to 1-5 (default 3), supports bounded attempts, request timeouts, exponential jitter, numeric/date `Retry-After`, and persisted per-scope circuit states (`closed`, `open`, `half_open`). Provider scopes use `provider:<id>` and are isolated from channel scopes such as `channel:upi`.

The existing Provider Definition connection test now executes through this policy when the policy is available. Registration, page automation, and redeem submissions remain serial and continue to use the existing account/CDK locks; an unknown redeem outcome is therefore never retried by this helper.

`scripts/test-remote-operation-policy.cjs` covers concurrency bounds, Retry-After waiting, circuit persistence/isolation, and retry limits. No package is produced for this intermediate stage.
