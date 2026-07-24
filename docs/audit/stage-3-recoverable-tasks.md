# Stage 3 Recoverable Tasks

Date: 2026-07-25

This stage adds persistent tasks and events to the existing Chrome MV3 extension. It extends the current workflow, membership, redemption, router, and Sidepanel modules; it does not add another application, server, database, framework, or long-lived worker.

## Storage And Ownership

- `accountTasksV1` stores `{ schemaVersion: 1, items, updatedAt }` and is written only by `background/task-repository.js`.
- `accountTaskEventsV1` stores events under `byTaskId` and is written only by `background/task-event-store.js`.
- Active tasks are never pruned. The Repository keeps the most recent 100 completed tasks, and the Event Store keeps 100 detailed events per task before compacting older events into a summary.
- Task payloads, results, errors, events, and ordinary background logs use `shared/sensitive-data-redactor.js` before persistence or broadcast.

## Real Callers

- Automatic registration creates a `register` task and checkpoints the active workflow node.
- Batch and single-account membership checks create `verify_membership` tasks.
- Free-group AT supplement and invalid-AT refresh create `refresh_access_token` tasks.
- Free-account UPI, IDEAL, or PIX redemption creates a channel-specific `redeem` task.
- Existing operations still perform the business work. The task runtime wraps those operations and does not replace the workflow engine or membership checker.

## Locks And Recovery

- Resource keys support accounts, channel-scoped CDKs, auth tabs, and mailboxes. Complete CDKs are normalized into one-way hashes before persistence.
- Conflicting account locks fail closed with `TASK_RESOURCE_CONFLICT`; UPI, IDEAL, and PIX CDK locks remain independent.
- Normal success, failure, and pre-side-effect cancellation release locks at terminal persistence.
- Unknown or pending remote results retain locks and enter `waiting_remote` or `manual_review`; they never become eligible for blind resubmission.
- Startup recovery is deduplicated once per Service Worker instance and classifies safe resume, verification wait, remote query, local finalization, interruption, manual review, cancellation after submit, and deactivated accounts.
- Deactivated accounts are retained, their confirmed unusable AT is cleared by the account lifecycle path, and redemption is not retried.

## Sidepanel

The existing account-records panel contains a compact task section. It calls the real `GET_ACCOUNT_TASKS`, `GET_ACCOUNT_TASK_EVENTS`, and `CANCEL_ACCOUNT_TASK` routes, displays task status and progress, and isolates event details by `taskId`.

## Verification

- Focused task tests: 33 passed, including the 10 required interruption scenarios.
- Full unit tests: 381 passed, 0 failed, 0 skipped.
- Syntax: 366 tracked JS/CJS/MJS files passed.
- Audits: smoke, removed-network, and phone/SMS audits passed.
- Manifest: all 25 unique runtime references exist.
- Sensitive production scan: no private-key, AWS-key, OpenAI-key, or long Bearer-token pattern found.
- CodeGraph: synchronized; 368 indexed files, 6,729 nodes, and 26,167 edges.
- Staged diff whitespace check: passed.
- Packaging: intentionally skipped for this stage.

The smoke audit retains the existing non-failing warning that `background.js` exceeds the general 8000-line warning threshold. It is 15,218 lines and remains below the unchanged enforced 15,400-line limit.
