# Remove Removed Network And Phone SMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the unused IP proxy pool / Removed Network feature first, then delete the phone SMS signup feature without breaking email signup, email verification, UPI/IDEAL redeem, export/import, or release packaging.

**Architecture:** Treat this as two independent removals. Phase A removes the already-disabled Removed Network runtime, routes, UI, settings, and compatibility fields. Phase B removes phone signup and SMS provider plumbing while keeping email verification scripts and shared activation utilities that are still used by the normal email registration flow.

**Tech Stack:** Chrome MV3 extension, plain JavaScript, background service worker modules, content scripts, sidepanel UI, Node syntax checks, repository smoke scripts.

---

## Scope Split

The selected items touch different subsystems:

- `先删 IP 代理池 / Removed Network`: low risk because the runtime is already disabled by `LEGACY_REMOVED_NETWORK_FEATURE_ENABLED = false`; deletion should be completed and committed first.
- `手机接码`: higher risk because the phone branch shares step 2, step 4, registration state, content script manifest entries, and verification helpers with email signup. Execute this only after the Removed Network commit is green.

Do not push to GitHub, update the version, build a zip, or publish a release during this plan unless the user explicitly asks after implementation.

## File Structure Map

### Phase A: Removed Network / IP Proxy Pool

- Modify `background.js`
  - Remove Removed Network constants, default state keys, persisted settings, normalizers, runtime disable helpers, auto sync alarm handling, startup/install disable calls, and injected message-router dependencies.
- Modify `background/message-router.js`
  - Remove message handlers and dependency parameters for `RUN_REMOVED_NETWORK_AUTO_SYNC_NOW`, `REFRESH_REMOVED_NETWORK_POOL`, `SWITCH_REMOVED_NETWORK`, `CHANGE_REMOVED_NETWORK_EXIT`, and `PROBE_REMOVED_NETWORK_EXIT`.
- Modify `sidepanel/sidepanel.js`
  - Remove Removed Network state normalization, settings rendering, event listeners, data merge, import/export payload keys, and any visible IP proxy pool controls.
- Modify `sidepanel/styles/settings.css`
  - Remove CSS blocks used only by Removed Network controls.
- Modify `sidepanel/sidepanel.html`
  - Remove static Removed Network sections if present.
- Modify `scripts/audit-smoke-tests.mjs`
  - Remove any assertion that expects Removed Network controls or settings.
- Create `scripts/audit-no-removed-network.mjs`
  - Static regression check that fails if Removed Network identifiers remain in runtime/UI files.

### Phase B: Phone SMS Signup

- Modify `manifest.json`
  - Remove `content/signup-phone-page.js` from content scripts.
  - Keep `content/signup-verification-page.js` unless implementation proves it is phone-only. It is also part of generic verification handling, so do not delete it blindly.
- Delete `content/signup-phone-page.js`
  - Remove only after manifest and background routes no longer reference it.
- Modify `content/activation-utils.js`
  - Remove phone-only helpers only if they are not called by email signup, email verification, or shared content script activation.
- Modify `shared/flow-capabilities.js`
  - Remove `SIGNUP_METHOD_PHONE`, phone capability flags, phone provider validation, and phone signup labels.
- Modify `background.js`
  - Remove phone/SMS provider constants, default state fields, provider factory wiring, `phoneVerificationHelpers`, and step dependencies for phone flows.
- Modify `background/steps/submit-signup-email.js`
  - Remove phone signup branch and ensure step 2 always routes to email registration.
- Modify `background/steps/fill-password.js`
  - Remove phone identity/password branch while preserving email password state.
- Modify `background/steps/fetch-signup-code.js`
  - Remove `executeSignupPhoneCodeStep()` and phone branch selection. Keep `executeSignupEmailVerificationStep()`.
- Modify `background/auto-run-controller.js`
  - Remove phone-specific failure handling, add-phone recovery, and phone supply exhaustion handling.
- Modify `background/message-router.js`
  - Remove phone-only messages if any remain after background cleanup.
- Modify `sidepanel/sidepanel.js`
  - Remove phone signup method controls, provider settings, phone wait/poll settings, and import/export keys for phone providers.
- Modify `sidepanel/sidepanel.html`
  - Remove static phone settings sections if present.
- Modify `sidepanel/styles/settings.css`
  - Remove phone-provider-only styles after confirming no shared settings style uses them.
- Modify `scripts/audit-smoke-tests.mjs`
  - Remove assertions that require phone signup content scripts.
- Create `scripts/audit-no-phone-sms.mjs`
  - Static regression check that fails if phone signup/SMS provider identifiers remain in runtime/UI files.

---

## Phase A: Remove Removed Network / IP Proxy Pool

### Task A1: Add Removed Network Static Guard

**Files:**
- Create: `scripts/audit-no-removed-network.mjs`

- [ ] **Step 1: Create the failing audit script**

Create `scripts/audit-no-removed-network.mjs` with this exact content:

```javascript
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const checks = [
  {
    file: 'background.js',
    patterns: [
      /removedNetwork/i,
      /REMOVED_NETWORK/,
      /RemovedNetwork/,
      /legacy removed network/i,
      /switchRemovedNetwork/,
      /refreshRemovedNetworkPool/,
      /disableLegacyRemovedNetworkFeatureRuntime/,
    ],
  },
  {
    file: 'background/message-router.js',
    patterns: [
      /RUN_REMOVED_NETWORK_AUTO_SYNC_NOW/,
      /REFRESH_REMOVED_NETWORK_POOL/,
      /SWITCH_REMOVED_NETWORK/,
      /CHANGE_REMOVED_NETWORK_EXIT/,
      /PROBE_REMOVED_NETWORK_EXIT/,
      /removedNetwork/i,
    ],
  },
  {
    file: 'sidepanel/sidepanel.js',
    patterns: [
      /removedNetwork/i,
      /REMOVED_NETWORK/,
      /Removed Network/i,
      /IP\s*代理池/,
      /刷新代理池/,
      /切换出口/,
    ],
  },
  {
    file: 'sidepanel/sidepanel.html',
    patterns: [
      /removedNetwork/i,
      /removed-network/i,
      /Removed Network/i,
      /IP\s*代理池/,
    ],
  },
  {
    file: 'sidepanel/styles/settings.css',
    patterns: [
      /removed-network/i,
      /removedNetwork/i,
      /proxy-pool/i,
    ],
  },
  {
    file: 'scripts/audit-smoke-tests.mjs',
    patterns: [
      /removedNetwork/i,
      /REMOVED_NETWORK/,
      /Removed Network/i,
    ],
  },
];

const failures = [];

for (const check of checks) {
  const absolute = path.join(repoRoot, check.file);
  if (!fs.existsSync(absolute)) {
    continue;
  }
  const text = fs.readFileSync(absolute, 'utf8');
  const lines = text.split(/\r?\n/);
  for (const pattern of check.patterns) {
    lines.forEach((line, index) => {
      if (pattern.test(line)) {
        failures.push(`${check.file}:${index + 1}: ${pattern} :: ${line.trim()}`);
      }
    });
  }
}

if (failures.length) {
  console.error('Removed Network remnants found:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('No Removed Network remnants found.');
```

- [ ] **Step 2: Run audit and confirm it fails before deletion**

Run:

```powershell
node scripts/audit-no-removed-network.mjs
```

Expected: FAIL with one or more Removed Network matches. If it passes before deletion, inspect the file list because the audit is not covering the current code.

- [ ] **Step 3: Commit only after later tasks pass**

Do not commit this script alone. It should be committed with the deletion that makes it pass.

### Task A2: Remove Removed Network Background State And Runtime

**Files:**
- Modify: `background.js`

- [ ] **Step 1: Remove constants**

Delete the Removed Network constants block from `background.js`. The block includes these identifiers:

```javascript
DEFAULT_REMOVED_NETWORK_SERVICE_URL
DEFAULT_REMOVED_NETWORK_SERVICE_TIMEOUT_MS
DEFAULT_REMOVED_NETWORK_AUTO_SYNC_ENABLED
DEFAULT_REMOVED_NETWORK_AUTO_SYNC_INTERVAL_MINUTES
DEFAULT_REMOVED_NETWORK_SWITCH_INTERVAL_MINUTES
DEFAULT_REMOVED_NETWORK_MODE
DEFAULT_REMOVED_NETWORK_PROTOCOL
DEFAULT_REMOVED_NETWORK_ROUTE
LEGACY_REMOVED_NETWORK_FEATURE_ENABLED
```

After deletion, run:

```powershell
node --check background.js
```

Expected: PASS.

- [ ] **Step 2: Remove default state keys**

Delete every `DEFAULT_STATE` field whose name starts with:

```javascript
removedNetwork
```

Also delete adjacent default fields that only exist to support Removed Network exit, pool, sync, or route state.

Run:

```powershell
node --check background.js
```

Expected: PASS. If a reference error appears, continue removing the matching runtime code in this task before moving on.

- [ ] **Step 3: Remove persisted settings keys**

Delete every Removed Network key from `PERSISTED_SETTING_KEYS` and settings migration helpers. Remove keys whose names start with:

```javascript
removedNetwork
```

Run:

```powershell
node --check background.js
```

Expected: PASS.

- [ ] **Step 4: Remove helper functions**

Delete the functions and any local-only helpers used only by them:

```javascript
normalizeRemovedNetworkServiceUrl
normalizeRemovedNetworkMode
normalizeRemovedNetworkProtocol
normalizeRemovedNetworkRoute
normalizeRemovedNetworkPool
normalizeRemovedNetworkExit
buildRemovedNetworkSettingsPatch
applyRemovedNetworkSettingsFromState
refreshRemovedNetworkPool
switchRemovedNetwork
changeRemovedNetworkExit
probeRemovedNetworkExit
runRemovedNetworkAutoSyncNow
scheduleRemovedNetworkAutoSyncAlarm
disableLegacyRemovedNetworkFeatureRuntime
```

If a name is not present, skip that exact name and remove the current equivalent found in the same Removed Network block.

Run:

```powershell
node --check background.js
```

Expected: PASS.

- [ ] **Step 5: Remove startup/install/alarm calls**

Delete startup/install/alarm code that calls Removed Network helpers. Specifically remove calls that mention:

```javascript
removedNetwork
REMOVED_NETWORK
disableLegacyRemovedNetworkFeatureRuntime
scheduleRemovedNetworkAutoSyncAlarm
```

Run:

```powershell
node --check background.js
```

Expected: PASS.

- [ ] **Step 6: Remove message-router dependencies**

When `createMessageRouter(...)` is called from `background.js`, remove dependency properties that only serve Removed Network:

```javascript
applyRemovedNetworkSettingsFromState
changeRemovedNetworkExit
probeRemovedNetworkExit
refreshRemovedNetworkPool
runRemovedNetworkAutoSyncNow
switchRemovedNetwork
```

Run:

```powershell
node --check background.js
```

Expected: PASS.

### Task A3: Remove Removed Network Message Routes

**Files:**
- Modify: `background/message-router.js`

- [ ] **Step 1: Remove dependency destructuring**

Delete these dependency names from the router factory destructuring:

```javascript
applyRemovedNetworkSettingsFromState
changeRemovedNetworkExit
probeRemovedNetworkExit
refreshRemovedNetworkPool
runRemovedNetworkAutoSyncNow
switchRemovedNetwork
```

Run:

```powershell
node --check background/message-router.js
```

Expected: PASS or a clear reference error from routes that are removed in the next step.

- [ ] **Step 2: Remove route cases**

Delete message cases for:

```javascript
RUN_REMOVED_NETWORK_AUTO_SYNC_NOW
REFRESH_REMOVED_NETWORK_POOL
SWITCH_REMOVED_NETWORK
CHANGE_REMOVED_NETWORK_EXIT
PROBE_REMOVED_NETWORK_EXIT
```

After deletion, there should be no switch case, if-branch, or handler object key for those message types.

Run:

```powershell
node --check background/message-router.js
```

Expected: PASS.

- [ ] **Step 3: Remove Removed Network route helpers**

Delete small router-only helpers that exist solely to validate, normalize, or report Removed Network route responses.

Run:

```powershell
node --check background/message-router.js
node scripts/audit-no-removed-network.mjs
```

Expected: `message-router.js` syntax PASS. The audit can still fail because UI files are not cleaned yet.

### Task A4: Remove Removed Network Sidepanel UI And State

**Files:**
- Modify: `sidepanel/sidepanel.js`
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/styles/settings.css`

- [ ] **Step 1: Remove sidepanel constants and local state**

Delete constants, cached DOM references, and local state keys in `sidepanel/sidepanel.js` that include:

```javascript
removedNetwork
REMOVED_NETWORK
removed-network
```

Run:

```powershell
node --check sidepanel/sidepanel.js
```

Expected: PASS or a clear reference error from UI render/event code removed in the next steps.

- [ ] **Step 2: Remove render functions**

Delete Removed Network render/update functions in `sidepanel/sidepanel.js`, including functions whose names contain:

```javascript
RemovedNetwork
removedNetwork
```

Keep generic settings rendering helpers if other settings sections call them.

Run:

```powershell
node --check sidepanel/sidepanel.js
```

Expected: PASS or a clear reference error from event listeners removed in the next step.

- [ ] **Step 3: Remove event listeners and background messages**

Delete event handlers and `chrome.runtime.sendMessage` calls in `sidepanel/sidepanel.js` for:

```javascript
RUN_REMOVED_NETWORK_AUTO_SYNC_NOW
REFRESH_REMOVED_NETWORK_POOL
SWITCH_REMOVED_NETWORK
CHANGE_REMOVED_NETWORK_EXIT
PROBE_REMOVED_NETWORK_EXIT
```

Run:

```powershell
node --check sidepanel/sidepanel.js
```

Expected: PASS.

- [ ] **Step 4: Remove static HTML section if present**

Search only `sidepanel/sidepanel.html` for:

```text
removedNetwork
removed-network
Removed Network
IP 代理池
```

If matches exist, delete the complete settings section that owns those IDs/classes. Do not delete neighboring settings cards.

Run:

```powershell
node --check sidepanel/sidepanel.js
```

Expected: PASS.

- [ ] **Step 5: Remove CSS selectors**

Delete CSS rules in `sidepanel/styles/settings.css` whose selectors contain:

```text
removed-network
removedNetwork
proxy-pool
```

If a CSS rule is shared with another settings component, split it by selector first, then delete only the Removed Network selector.

Run:

```powershell
node --check sidepanel/sidepanel.js
node scripts/audit-no-removed-network.mjs
```

Expected: syntax PASS. The audit should now fail only if import/export or smoke tests still mention Removed Network.

### Task A5: Remove Removed Network Config Import/Export Compatibility

**Files:**
- Modify: `sidepanel/sidepanel.js`
- Modify: `background.js`
- Modify: `scripts/audit-smoke-tests.mjs`

- [ ] **Step 1: Remove export payload keys**

In `sidepanel/sidepanel.js`, remove every exported config key that starts with:

```javascript
removedNetwork
```

Exported settings files should no longer contain IP proxy pool or Removed Network settings.

Run:

```powershell
node --check sidepanel/sidepanel.js
```

Expected: PASS.

- [ ] **Step 2: Remove import merge keys**

In `sidepanel/sidepanel.js`, remove import merge logic for keys that start with:

```javascript
removedNetwork
```

Old configuration files may still contain those keys; the importer should ignore unknown fields instead of writing them into active state.

Run:

```powershell
node --check sidepanel/sidepanel.js
```

Expected: PASS.

- [ ] **Step 3: Remove background persistence**

In `background.js`, remove any persistence or state migration path that writes Removed Network fields back into storage.

Run:

```powershell
node --check background.js
```

Expected: PASS.

- [ ] **Step 4: Update smoke audit**

If `scripts/audit-smoke-tests.mjs` expects Removed Network text, IDs, message types, or config keys, delete those assertions.

Run:

```powershell
node scripts/audit-smoke-tests.mjs
node scripts/audit-no-removed-network.mjs
```

Expected: both PASS.

### Task A6: Verify And Commit Removed Network Deletion

**Files:**
- Verify all files touched in Phase A.

- [ ] **Step 1: Run targeted syntax checks**

Run:

```powershell
node --check background.js
node --check background/message-router.js
node --check sidepanel/sidepanel.js
node --check scripts/audit-no-removed-network.mjs
```

Expected: all PASS.

- [ ] **Step 2: Run smoke checks**

Run:

```powershell
node scripts/audit-smoke-tests.mjs
node scripts/audit-no-removed-network.mjs
```

Expected: both PASS.

- [ ] **Step 3: Run full JavaScript syntax check**

Run:

```powershell
$failed = @()
git ls-files '*.js' '*.mjs' | ForEach-Object {
  if (Test-Path -LiteralPath $_) {
    node --check $_
    if ($LASTEXITCODE -ne 0) { $failed += $_ }
  }
}
if ($failed.Count) { throw "Syntax check failed: $($failed -join ', ')" }
```

Expected: command completes without throwing.

- [ ] **Step 4: Review diff**

Run:

```powershell
git diff -- background.js background/message-router.js sidepanel/sidepanel.js sidepanel/sidepanel.html sidepanel/styles/settings.css scripts/audit-smoke-tests.mjs scripts/audit-no-removed-network.mjs
```

Expected: diff contains only Removed Network deletion and the new audit script.

- [ ] **Step 5: Commit Phase A**

Run:

```powershell
git add background.js background/message-router.js sidepanel/sidepanel.js sidepanel/sidepanel.html sidepanel/styles/settings.css scripts/audit-smoke-tests.mjs scripts/audit-no-removed-network.mjs
git commit -m "refactor: remove Removed Network proxy pool"
```

Expected: commit succeeds.

---

## Phase B: Remove Phone SMS Signup

Execute Phase B only after Phase A is committed and all checks are green.

### Task B1: Add Phone SMS Static Guard

**Files:**
- Create: `scripts/audit-no-phone-sms.mjs`

- [ ] **Step 1: Create the failing audit script**

Create `scripts/audit-no-phone-sms.mjs` with this exact content:

```javascript
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const checks = [
  {
    file: 'manifest.json',
    patterns: [
      /signup-phone-page\.js/,
    ],
  },
  {
    file: 'background.js',
    patterns: [
      /createPhoneVerificationHelpers/,
      /phoneVerificationHelpers/,
      /DEFAULT_FIVE_SIM_/,
      /DEFAULT_REMOVED_SMS_/,
      /DEFAULT_SMS_VERIFICATION_NUMBER_/,
      /DEFAULT_GRIZZLY/,
      /DEFAULT_PHONE_CODE_/,
      /signupPhone/,
      /accountIdentifierType.*phone/,
    ],
  },
  {
    file: 'background/steps/submit-signup-email.js',
    patterns: [
      /SIGNUP_METHOD_PHONE/,
      /signupPhone/,
      /phoneSignup/i,
      /accountIdentifierType.*phone/,
    ],
  },
  {
    file: 'background/steps/fill-password.js',
    patterns: [
      /SIGNUP_METHOD_PHONE/,
      /signupPhone/,
      /phoneSignup/i,
      /accountIdentifierType.*phone/,
    ],
  },
  {
    file: 'background/steps/fetch-signup-code.js',
    patterns: [
      /executeSignupPhoneCodeStep/,
      /completeSignupPhoneVerificationFlow/,
      /phoneVerificationHelpers/,
      /signupPhone/,
      /accountIdentifierType.*phone/,
    ],
  },
  {
    file: 'background/auto-run-controller.js',
    patterns: [
      /phoneSignup/i,
      /signupPhone/,
      /add-phone/,
      /phone supply/i,
      /accountIdentifierType.*phone/,
    ],
  },
  {
    file: 'shared/flow-capabilities.js',
    patterns: [
      /SIGNUP_METHOD_PHONE/,
      /supportsPhoneSignup/,
      /phoneVerificationEnabled/,
      /signupPhone/,
    ],
  },
  {
    file: 'sidepanel/sidepanel.js',
    patterns: [
      /SIGNUP_METHOD_PHONE/,
      /signupPhone/,
      /phoneProvider/i,
      /phoneCode/i,
      /5sim/i,
      /grizzlysms/i,
      /removedSms/i,
      /smsVerificationNumber/i,
    ],
  },
  {
    file: 'scripts/audit-smoke-tests.mjs',
    patterns: [
      /signup-phone-page\.js/,
      /SIGNUP_METHOD_PHONE/,
      /supportsPhoneSignup/,
    ],
  },
];

const failures = [];

for (const check of checks) {
  const absolute = path.join(repoRoot, check.file);
  if (!fs.existsSync(absolute)) {
    continue;
  }
  const text = fs.readFileSync(absolute, 'utf8');
  const lines = text.split(/\r?\n/);
  for (const pattern of check.patterns) {
    lines.forEach((line, index) => {
      if (pattern.test(line)) {
        failures.push(`${check.file}:${index + 1}: ${pattern} :: ${line.trim()}`);
      }
    });
  }
}

const deletedPhonePage = !fs.existsSync(path.join(repoRoot, 'content/signup-phone-page.js'));
if (!deletedPhonePage) {
  failures.push('content/signup-phone-page.js still exists');
}

if (failures.length) {
  console.error('Phone SMS signup remnants found:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('No phone SMS signup remnants found.');
```

- [ ] **Step 2: Run audit and confirm it fails before deletion**

Run:

```powershell
node scripts/audit-no-phone-sms.mjs
```

Expected: FAIL with phone/SMS matches.

### Task B2: Remove Phone Signup Capability Flags

**Files:**
- Modify: `shared/flow-capabilities.js`
- Modify: `data/step-definitions.js`

- [ ] **Step 1: Remove phone signup constants**

Delete constants and exports for:

```javascript
SIGNUP_METHOD_PHONE
supportsPhoneSignup
phoneVerificationEnabled
```

Keep email signup capability and UPI/IDEAL redeem capability unchanged.

Run:

```powershell
node --check shared/flow-capabilities.js
node --check data/step-definitions.js
```

Expected: PASS or reference errors from call sites that are removed in following tasks.

- [ ] **Step 2: Force signup method resolution to email**

If `shared/flow-capabilities.js` has a method resolver, reduce it to email-only behavior:

```javascript
function resolveSignupMethod() {
  return 'email';
}
```

If this function is not exported, remove the resolver and update call sites to stop asking for phone mode.

Run:

```powershell
node --check shared/flow-capabilities.js
```

Expected: PASS.

- [ ] **Step 3: Remove phone step definitions**

In `data/step-definitions.js`, remove phone-only step labels and prerequisites. Keep the existing email registration steps and the UPI step 7 flow.

Run:

```powershell
node --check data/step-definitions.js
```

Expected: PASS.

### Task B3: Remove Phone Branches From Registration Steps

**Files:**
- Modify: `background/steps/submit-signup-email.js`
- Modify: `background/steps/fill-password.js`
- Modify: `background/steps/fetch-signup-code.js`

- [ ] **Step 1: Remove step 2 phone branch**

In `background/steps/submit-signup-email.js`, delete branches that test phone signup mode or submit phone numbers. Step 2 should only submit an email identity.

Preserve the existing email flow behavior:

```javascript
// Step 2 remains email-only after this deletion.
// Keep the current email submission implementation and remove only phone-mode branches.
```

Run:

```powershell
node --check background/steps/submit-signup-email.js
```

Expected: PASS.

- [ ] **Step 2: Remove step 3 phone identity password handling**

In `background/steps/fill-password.js`, delete phone identity branches and keep email password handling.

After deletion, password state should only store an email identifier:

```javascript
accountIdentifierType: 'email'
```

Run:

```powershell
node --check background/steps/fill-password.js
```

Expected: PASS.

- [ ] **Step 3: Remove step 4 phone code flow**

In `background/steps/fetch-signup-code.js`, delete:

```javascript
executeSignupPhoneCodeStep
isPhoneSignupState
phoneVerificationHelpers dependency
resolveSignupMethod dependency
completeSignupPhoneVerificationFlow calls
```

Keep:

```javascript
executeSignupEmailVerificationStep
resolveCustomEmailVerificationStep
resolveVerificationStep
```

Run:

```powershell
node --check background/steps/fetch-signup-code.js
```

Expected: PASS.

### Task B4: Remove Phone Provider Runtime From Background

**Files:**
- Modify: `background.js`
- Modify: `background/message-router.js`
- Modify: `background/auto-run-controller.js`

- [ ] **Step 1: Remove phone provider constants and default state**

In `background.js`, delete constants and state fields for:

```javascript
fiveSim
removedSms
removedSmsVendor
removedSmsVendorB
smsVerificationNumber
grizzlySms
removedTextPool
signupPhone
phoneCode
phoneVerification
```

Do not remove email provider constants or Assurivo/mail verification constants.

Run:

```powershell
node --check background.js
```

Expected: PASS or reference errors from helper wiring removed in the next step.

- [ ] **Step 2: Remove provider factories and helper wiring**

In `background.js`, delete:

```javascript
phoneVerificationHelpers
self.MultiPageBackgroundPhoneVerification?.createPhoneVerificationHelpers(...)
createFiveSimProvider
createRemovedSmsVendorBProvider
createRemovedSmsProvider
createRemovedSmsVendorProvider
createSmsVerificationNumberProvider
createGrizzlySmsProvider
createRemovedTextPoolProvider
```

Also remove script imports or module registrations for phone provider modules if present.

Run:

```powershell
node --check background.js
```

Expected: PASS.

- [ ] **Step 3: Remove phone dependencies passed into step executors**

In `background.js`, remove `phoneVerificationHelpers` and `resolveSignupMethod` dependencies when creating the step 2/3/4 executors if those dependencies are phone-only after Task B3.

Run:

```powershell
node --check background.js
```

Expected: PASS.

- [ ] **Step 4: Remove phone auto-run failure handling**

In `background/auto-run-controller.js`, delete phone-specific branches for add-phone pages, phone supply exhaustion, phone activation, and phone identity failure summaries.

Run:

```powershell
node --check background/auto-run-controller.js
```

Expected: PASS.

- [ ] **Step 5: Remove phone message routes**

In `background/message-router.js`, delete message routes and dependencies that exist only for phone provider testing, phone number allocation, phone code polling, or phone activation.

Run:

```powershell
node --check background/message-router.js
```

Expected: PASS.

### Task B5: Remove Phone Content Script And Manifest Entry

**Files:**
- Modify: `manifest.json`
- Delete: `content/signup-phone-page.js`
- Modify: `content/activation-utils.js`
- Keep unless audited phone-only: `content/signup-verification-page.js`

- [ ] **Step 1: Remove manifest content script entry**

In `manifest.json`, remove the content script entry or file reference:

```json
"content/signup-phone-page.js"
```

Keep content scripts used by email registration and email verification.

Run:

```powershell
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
```

Expected: prints `manifest ok`.

- [ ] **Step 2: Delete phone page content script**

Delete:

```text
content/signup-phone-page.js
```

Run:

```powershell
Test-Path -LiteralPath 'content/signup-phone-page.js'
```

Expected: `False`.

- [ ] **Step 3: Keep generic verification content script unless proven phone-only**

Inspect references to `content/signup-verification-page.js`. If email verification still uses it, keep the file and remove only phone-specific branches inside it.

Run:

```powershell
node --check content/signup-verification-page.js
```

Expected: PASS if the file remains.

- [ ] **Step 4: Clean shared activation helpers**

In `content/activation-utils.js`, delete phone-only helpers only after verifying they are not used by:

```text
content/signup-page.js
content/signup-verification-page.js
content/chatgpt-page.js
```

Run:

```powershell
node --check content/activation-utils.js
```

Expected: PASS.

### Task B6: Remove Phone Sidepanel Settings And Import/Export Keys

**Files:**
- Modify: `sidepanel/sidepanel.js`
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/styles/settings.css`

- [ ] **Step 1: Remove phone provider settings UI**

In `sidepanel/sidepanel.js`, delete UI state, renderers, inputs, and event listeners for:

```javascript
fiveSim
removedSms
removedSmsVendor
removedSmsVendorB
smsVerificationNumber
grizzlySms
removedTextPool
signupPhone
phoneProvider
phoneCode
```

Run:

```powershell
node --check sidepanel/sidepanel.js
```

Expected: PASS or clear reference errors from import/export code removed in the next step.

- [ ] **Step 2: Remove phone config import/export keys**

In `sidepanel/sidepanel.js`, remove phone provider keys from exported configuration and imported configuration merge logic.

Old config files may still contain these fields; importer should ignore them as unknown fields after deletion.

Run:

```powershell
node --check sidepanel/sidepanel.js
```

Expected: PASS.

- [ ] **Step 3: Remove static phone HTML sections**

In `sidepanel/sidepanel.html`, delete settings sections whose IDs/classes/text are phone provider specific:

```text
phone
5sim
GrizzlySMS
Removed SMS
接码
手机号
```

Do not delete email provider settings, Assurivo settings, UPI/IDEAL CDK settings, or Free/Plus group UI.

Run:

```powershell
node --check sidepanel/sidepanel.js
```

Expected: PASS.

- [ ] **Step 4: Remove phone-only CSS**

In `sidepanel/styles/settings.css`, remove selectors used only by phone provider panels. Keep shared setting row/button styles.

Run:

```powershell
node --check sidepanel/sidepanel.js
```

Expected: PASS.

### Task B7: Update Audits And Verify Phone Removal

**Files:**
- Modify: `scripts/audit-smoke-tests.mjs`
- Verify: `scripts/audit-no-phone-sms.mjs`

- [ ] **Step 1: Remove phone content script assertion**

In `scripts/audit-smoke-tests.mjs`, remove assertions that require:

```javascript
content/signup-phone-page.js
SIGNUP_METHOD_PHONE
supportsPhoneSignup
phoneVerificationEnabled
```

Keep assertions for email signup, email verification, UPI/IDEAL redeem, export/import, and sidepanel loading.

Run:

```powershell
node scripts/audit-smoke-tests.mjs
```

Expected: PASS.

- [ ] **Step 2: Run phone deletion audit**

Run:

```powershell
node scripts/audit-no-phone-sms.mjs
```

Expected: PASS.

- [ ] **Step 3: Run targeted syntax checks**

Run:

```powershell
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
node --check background.js
node --check background/message-router.js
node --check background/auto-run-controller.js
node --check background/steps/submit-signup-email.js
node --check background/steps/fill-password.js
node --check background/steps/fetch-signup-code.js
node --check shared/flow-capabilities.js
node --check sidepanel/sidepanel.js
node --check content/signup-page.js
node --check content/signup-verification-page.js
node --check content/activation-utils.js
node --check scripts/audit-no-phone-sms.mjs
```

Expected: JSON parse prints `manifest ok`; all JavaScript files PASS.

- [ ] **Step 4: Run full syntax check**

Run:

```powershell
$failed = @()
git ls-files '*.js' '*.mjs' | ForEach-Object {
  if (Test-Path -LiteralPath $_) {
    node --check $_
    if ($LASTEXITCODE -ne 0) { $failed += $_ }
  }
}
if ($failed.Count) { throw "Syntax check failed: $($failed -join ', ')" }
```

Expected: command completes without throwing.

- [ ] **Step 5: Review diff**

Run:

```powershell
git diff -- manifest.json background.js background/message-router.js background/auto-run-controller.js background/steps/submit-signup-email.js background/steps/fill-password.js background/steps/fetch-signup-code.js shared/flow-capabilities.js sidepanel/sidepanel.js sidepanel/sidepanel.html sidepanel/styles/settings.css content/activation-utils.js content/signup-verification-page.js scripts/audit-smoke-tests.mjs scripts/audit-no-phone-sms.mjs
```

Expected: diff removes phone signup/SMS functionality only. It must not remove email verification, Assurivo, UPI/IDEAL CDK pools, Free/Plus groups, or export/import for remaining settings.

- [ ] **Step 6: Commit Phase B**

Run:

```powershell
git add manifest.json background.js background/message-router.js background/auto-run-controller.js background/steps/submit-signup-email.js background/steps/fill-password.js background/steps/fetch-signup-code.js shared/flow-capabilities.js sidepanel/sidepanel.js sidepanel/sidepanel.html sidepanel/styles/settings.css content/activation-utils.js content/signup-verification-page.js scripts/audit-smoke-tests.mjs scripts/audit-no-phone-sms.mjs
git add -u content/signup-phone-page.js
git commit -m "refactor: remove phone SMS signup flow"
```

Expected: commit succeeds.

---

## Final Verification After Both Phases

- [ ] **Step 1: Confirm worktree is clean**

Run:

```powershell
git status --short
```

Expected: no output.

- [ ] **Step 2: Confirm Removed Network audit is still green**

Run:

```powershell
node scripts/audit-no-removed-network.mjs
```

Expected: PASS.

- [ ] **Step 3: Confirm phone SMS audit is green**

Run:

```powershell
node scripts/audit-no-phone-sms.mjs
```

Expected: PASS.

- [ ] **Step 4: Confirm smoke tests are green**

Run:

```powershell
node scripts/audit-smoke-tests.mjs
```

Expected: PASS.

- [ ] **Step 5: Confirm full syntax is green**

Run:

```powershell
$failed = @()
git ls-files '*.js' '*.mjs' | ForEach-Object {
  if (Test-Path -LiteralPath $_) {
    node --check $_
    if ($LASTEXITCODE -ne 0) { $failed += $_ }
  }
}
if ($failed.Count) { throw "Syntax check failed: $($failed -join ', ')" }
```

Expected: command completes without throwing.

## Manual Smoke Checklist

- [ ] Extension sidepanel opens without console errors.
- [ ] Settings page no longer shows Removed Network, IP proxy pool, phone signup, or SMS provider controls.
- [ ] Exported configuration no longer contains Removed Network or phone SMS provider keys.
- [ ] Importing an old configuration with Removed Network/phone keys does not recreate the removed UI or crash.
- [ ] Email registration still reaches the email verification page.
- [ ] Assurivo/iCloud/custom email code fetching still works.
- [ ] Step 7 UPI eligibility check still writes eligible accounts to Free.
- [ ] UPI and IDEAL CDK pools still import, redeem, refresh, cancel, retry, and delete independently.
- [ ] Free/UPI Plus/IDEAL Plus grouping still renders correctly.

## Self-Review Notes

- Spec coverage: the plan deletes the selected `IP 代理池 / Removed Network` first and includes a separate phone SMS deletion phase.
- Boundary protection: the plan explicitly preserves email verification and does not blindly delete `content/signup-verification-page.js` or `content/activation-utils.js`.
- Verification: each phase has a static guard, syntax checks, smoke checks, diff review, and its own commit.
