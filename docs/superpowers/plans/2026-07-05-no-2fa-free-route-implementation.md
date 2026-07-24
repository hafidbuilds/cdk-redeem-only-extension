# No-2FA Free Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a selectable no-2FA registration route that writes trial-eligible accounts to Free with `email---verificationUrl---accessToken---timestamp`.

**Architecture:** Keep the existing full 2FA workflow unchanged. Add a persisted `registrationFreeRoute` setting that makes `data/step-definitions.js` return either the current 7-step workflow or a no-2FA workflow that replaces steps 6/7 with one background finalization node. Reuse the existing ChatGPT session reader and `checkRegistrationUpiTrialEligibility()`/`upsertTrialEligibleFreeCredential()` path so eligibility and Free writes stay centralized.

**Tech Stack:** Chrome MV3 extension, vanilla JavaScript, background service worker modules, sidepanel DOM UI, Node syntax/audit scripts.

---

## File Structure

- Modify `data/step-definitions.js`
  - Owns the full 2FA vs no-2FA workflow shape.
  - Adds route constants and the `persist-no-2fa-free` node.
- Modify `sidepanel/sidepanel.html`
  - Adds a visible route selector in the main settings area.
- Modify `sidepanel/sidepanel.js`
  - Reads/writes `registrationFreeRoute`.
  - Rebuilds visible steps when the selector changes.
  - Saves the setting with other persistent settings.
- Modify `background.js`
  - Adds persisted default/normalization for `registrationFreeRoute`.
  - Registers the new background executor.
  - Passes dependencies needed by the executor.
- Create `background/steps/no-2fa-free-route.js`
  - Performs the no-2FA route finalization after step 5.
  - Reads ChatGPT session, resolves email, resolves verification URL, checks eligibility, writes Free.
- Modify `background/upi-credential-membership-checker.js`
  - Preserves `verificationUrl`, `recordedAt`, `twoFactorEnabled`, `gptPassword`/empty password semantics on Free rows.
  - Exports no-2FA Free rows as `email---verificationUrl---accessToken---recordedAt`.
- Modify `background/steps/upi-redeem.js`
  - Extends `buildCurrentUpiCredentialForMembership()` and `checkRegistrationUpiTrialEligibility()` input handling so no-2FA metadata is passed through.
- Modify `Release.md`, `manifest.json`, `sidepanel/sidepanel.html` after implementation if the user asks to publish a version.

---

### Task 1: Add Route Setting And Workflow Shape

**Files:**
- Modify: `data/step-definitions.js:4-86`
- Modify: `background.js:809-850`, `background.js:2600-2878`
- Modify: `sidepanel/sidepanel.html:318-326`
- Modify: `sidepanel/sidepanel.js:180-200`, `sidepanel/sidepanel.js:554-591`, `sidepanel/sidepanel.js:628-727`, `sidepanel/sidepanel.js:2640-2690`, `sidepanel/sidepanel.js:4800-4890`, `sidepanel/sidepanel.js:10070-10150`

- [ ] **Step 1: Add route constants and a failing workflow check**

Create a temporary check command that should fail before implementation:

```powershell
node -e "const fs=require('fs'); const vm=require('vm'); const src=fs.readFileSync('data/step-definitions.js','utf8'); const ctx={}; vm.createContext(ctx); vm.runInContext(src,ctx); const defs=ctx.MultiPageStepDefinitions; const full=defs.getNodes({registrationFreeRoute:'full-2fa'}).map(n=>n.nodeId); const no=defs.getNodes({registrationFreeRoute:'no-2fa-free'}).map(n=>n.nodeId); if (!full.includes('enable-totp-mfa')) throw new Error('full route missing enable-totp-mfa'); if (no.includes('set-gpt-password') || no.includes('enable-totp-mfa')) throw new Error('no-2fa route still includes password/2FA'); if (!no.includes('persist-no-2fa-free')) throw new Error('no-2fa route missing finalization node'); console.log('PASS route workflow check');"
```

Expected before implementation: FAIL with `no-2fa route still includes password/2FA` or `missing finalization node`.

- [ ] **Step 2: Implement route-aware step definitions**

In `data/step-definitions.js`, add constants near the top:

```javascript
const REGISTRATION_FREE_ROUTE_FULL_2FA = 'full-2fa';
const REGISTRATION_FREE_ROUTE_NO_2FA = 'no-2fa-free';
```

Add:

```javascript
function normalizeRegistrationFreeRoute(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === REGISTRATION_FREE_ROUTE_NO_2FA
    ? REGISTRATION_FREE_ROUTE_NO_2FA
    : REGISTRATION_FREE_ROUTE_FULL_2FA;
}
```

Add a second workflow:

```javascript
const NO_2FA_FREE_STEP_DEFINITIONS = Object.freeze([
  ...UPI_STEP_DEFINITIONS.filter((step) => Number(step.id) <= 5),
  {
    id: 6,
    order: 60,
    key: 'persist-no-2fa-free',
    title: '免 2FA 检测资格并进入 Free',
    sourceId: 'chatgpt',
    driverId: null,
    command: 'persist-no-2fa-free',
  },
]);
```

Change `getSteps(options = {})` to:

```javascript
function getSteps(options = {}) {
  const flowId = normalizeActiveFlowId(options?.activeFlowId, DEFAULT_ACTIVE_FLOW_ID);
  const route = normalizeRegistrationFreeRoute(options?.registrationFreeRoute);
  const steps = route === REGISTRATION_FREE_ROUTE_NO_2FA
    ? NO_2FA_FREE_STEP_DEFINITIONS
    : UPI_STEP_DEFINITIONS;
  return cloneSteps(steps, options, flowId);
}
```

Export the new constants and normalizer from the returned object.

- [ ] **Step 3: Persist `registrationFreeRoute` in background state**

In `background.js`, add default:

```javascript
registrationFreeRoute: 'full-2fa',
```

Add a normalizer near persistent setting normalization:

```javascript
function normalizeRegistrationFreeRoute(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'no-2fa-free' ? 'no-2fa-free' : 'full-2fa';
}
```

In `normalizePersistentSettingValue`, add:

```javascript
case 'registrationFreeRoute':
  return normalizeRegistrationFreeRoute(value);
```

- [ ] **Step 4: Add sidepanel route selector**

In `sidepanel/sidepanel.html`, near the current `row-totp-mfa-after-profile-enabled`, add:

```html
<div class="data-row" id="row-registration-free-route">
  <span class="data-label">主流程路线</span>
  <select id="select-registration-free-route" class="data-input">
    <option value="full-2fa">完整 2FA 路线</option>
    <option value="no-2fa-free">免 2FA Free 路线</option>
  </select>
</div>
```

Keep `row-totp-mfa-after-profile-enabled` untouched for compatibility, but do not use it as the new route selector.

- [ ] **Step 5: Wire selector into sidepanel state and workflow refresh**

In `sidepanel/sidepanel.js`, add DOM ref:

```javascript
const selectRegistrationFreeRoute = document.getElementById('select-registration-free-route');
```

Add constants:

```javascript
const REGISTRATION_FREE_ROUTE_FULL_2FA = 'full-2fa';
const REGISTRATION_FREE_ROUTE_NO_2FA = 'no-2fa-free';
const DEFAULT_REGISTRATION_FREE_ROUTE = REGISTRATION_FREE_ROUTE_FULL_2FA;
```

Add:

```javascript
function normalizeRegistrationFreeRoute(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === REGISTRATION_FREE_ROUTE_NO_2FA
    ? REGISTRATION_FREE_ROUTE_NO_2FA
    : REGISTRATION_FREE_ROUTE_FULL_2FA;
}

function getSelectedRegistrationFreeRoute(state = latestState) {
  return normalizeRegistrationFreeRoute(selectRegistrationFreeRoute?.value || state?.registrationFreeRoute);
}
```

Pass `registrationFreeRoute` into every `getStepDefinitionsForMode()`, `getWorkflowNodesForMode()`, and `syncWorkflowDefinitions()` options object that already passes `totpMfaAfterProfileEnabled`.

When applying state to UI:

```javascript
if (selectRegistrationFreeRoute) {
  selectRegistrationFreeRoute.value = normalizeRegistrationFreeRoute(normalizedState?.registrationFreeRoute);
}
```

When saving settings, include:

```javascript
registrationFreeRoute: getSelectedRegistrationFreeRoute(latestState),
```

Add a `change` listener:

```javascript
selectRegistrationFreeRoute?.addEventListener('change', () => {
  const registrationFreeRoute = getSelectedRegistrationFreeRoute(latestState);
  syncWorkflowDefinitions(latestState.plusModeEnabled, {
    ...latestState,
    registrationFreeRoute,
  });
  syncLatestState({ registrationFreeRoute });
  saveSettings({ silent: true });
  renderWorkflow();
});
```

- [ ] **Step 6: Run route checks**

Run:

```powershell
node -e "const fs=require('fs'); const vm=require('vm'); const src=fs.readFileSync('data/step-definitions.js','utf8'); const ctx={}; vm.createContext(ctx); vm.runInContext(src,ctx); const defs=ctx.MultiPageStepDefinitions; const full=defs.getNodes({registrationFreeRoute:'full-2fa'}).map(n=>n.nodeId); const no=defs.getNodes({registrationFreeRoute:'no-2fa-free'}).map(n=>n.nodeId); if (!full.includes('set-gpt-password') || !full.includes('enable-totp-mfa')) throw new Error('full route changed'); if (no.includes('set-gpt-password') || no.includes('enable-totp-mfa')) throw new Error('no-2fa route includes password/2FA'); if (!no.includes('persist-no-2fa-free')) throw new Error('no-2fa route missing finalization node'); console.log('PASS route workflow check');"
node --check data/step-definitions.js
node --check sidepanel/sidepanel.js
node --check background.js
```

Expected: all PASS/no output for `node --check`.

- [ ] **Step 7: Commit**

```powershell
git add data/step-definitions.js sidepanel/sidepanel.html sidepanel/sidepanel.js background.js
git commit -m "feat: add registration free route selector"
```

---

### Task 2: Implement No-2FA Free Finalization Executor

**Files:**
- Create: `background/steps/no-2fa-free-route.js`
- Modify: `background.js:1-45`, `background.js:13550-13673`, `background.js:13760-13823`
- Modify: `background/steps/upi-redeem.js:724-744`, `background/steps/upi-redeem.js:3019-3118`

- [ ] **Step 1: Write a static failing check for executor registration**

Run before implementation:

```powershell
node -e "const fs=require('fs'); const bg=fs.readFileSync('background.js','utf8'); if (!bg.includes('background/steps/no-2fa-free-route.js')) throw new Error('missing import'); if (!bg.includes(\"'persist-no-2fa-free'\")) throw new Error('missing executor map key'); console.log('PASS no-2fa executor registration');"
```

Expected before implementation: FAIL.

- [ ] **Step 2: Create executor module**

Create `background/steps/no-2fa-free-route.js`:

```javascript
(function attachNo2faFreeRouteExecutor(root, factory) {
  root.MultiPageBackgroundNo2faFreeRoute = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createNo2faFreeRouteModule() {
  function normalizeString(value = '') {
    return String(value || '').trim();
  }

  function normalizeEmail(value = '') {
    return normalizeString(value).toLowerCase();
  }

  function normalizeTimestamp(value, fallback = Date.now()) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : Math.floor(Number(fallback) || Date.now());
  }

  function createNo2faFreeRouteExecutor(deps = {}) {
    const {
      addLog = async () => {},
      checkRegistrationUpiTrialEligibility = null,
      completeNodeFromBackground = async () => {},
      getState = async () => ({}),
      getCustomEmailPoolEntries = null,
      readCurrentChatGptSessionForExport = null,
      setState = async () => {},
      throwIfStopped = () => {},
    } = deps;

    async function addStepLog(message, level = 'info') {
      return addLog(message, level, {
        step: 6,
        stepKey: 'persist-no-2fa-free',
        nodeId: 'persist-no-2fa-free',
      });
    }

    function resolveVerificationUrl(state = {}, email = '') {
      const direct = normalizeString(state.verificationUrl || state.emailVerificationUrl || state.currentVerificationUrl);
      if (direct) return direct;
      const entries = typeof getCustomEmailPoolEntries === 'function'
        ? getCustomEmailPoolEntries(state)
        : [];
      const normalizedEmail = normalizeEmail(email);
      const matched = entries.find((entry) => normalizeEmail(entry?.email) === normalizedEmail);
      return normalizeString(matched?.verificationUrl || matched?.url);
    }

    async function executeNo2faFreeRoute(state = {}) {
      throwIfStopped();
      const latestState = {
        ...(await getState().catch(() => ({}))),
        ...(state || {}),
      };
      await addStepLog('免 2FA Free 路线：第 5 步完成，开始读取邮箱、取码链接和 AT。', 'info');
      if (typeof readCurrentChatGptSessionForExport !== 'function') {
        throw new Error('免 2FA Free 路线缺少 ChatGPT SESSION 读取能力。');
      }
      if (typeof checkRegistrationUpiTrialEligibility !== 'function') {
        throw new Error('免 2FA Free 路线缺少 UPI 试用资格检测能力。');
      }

      const sessionResult = await readCurrentChatGptSessionForExport();
      const session = sessionResult.session || {};
      const accessToken = normalizeString(sessionResult.accessToken || session.accessToken);
      const email = normalizeEmail(session?.user?.email || latestState.email || latestState.registrationEmailState?.current);
      if (!email) {
        throw new Error('免 2FA Free 路线未读取到当前 ChatGPT 邮箱。');
      }
      if (!accessToken) {
        throw new Error(`免 2FA Free 路线未读取到 ${email} 的 AT，账号未进入 Free。`);
      }
      const verificationUrl = resolveVerificationUrl(latestState, email);
      if (!verificationUrl) {
        throw new Error(`免 2FA Free 路线未找到 ${email} 的邮箱取码链接，账号未进入 Free。`);
      }
      const recordedAt = normalizeTimestamp(latestState.no2faFreeRecordedAt);
      await setState({
        email,
        verificationUrl,
        no2faFreeRecordedAt: recordedAt,
        upiRedeemAccessToken: accessToken,
      });

      const eligibility = await checkRegistrationUpiTrialEligibility({
        state: latestState,
        email,
        session,
        accessToken,
        visibleStep: 6,
        patch: {
          email,
          verificationUrl,
          recordedAt,
          no2faFreeRoute: true,
          twoFactorEnabled: false,
          password: '',
          gptPassword: '',
          totpMfaSecret: '',
        },
      });
      if (!eligibility?.eligible) {
        throw new Error(`免 2FA Free 路线：账号未通过 UPI 试用资格检测，未进入 Free：${eligibility?.reason || '未知原因'}`);
      }
      await addStepLog(`免 2FA Free 路线：已检测到 UPI 试用资格，写入 Free：${email}。`, 'ok');
      await completeNodeFromBackground('persist-no-2fa-free', {
        email,
        accessToken,
        verificationUrl,
        recordedAt,
        trialEligibilityStatus: 'eligible',
      });
      return eligibility;
    }

    return {
      executeNo2faFreeRoute,
      resolveVerificationUrl,
    };
  }

  return {
    createNo2faFreeRouteExecutor,
  };
});
```

- [ ] **Step 3: Register executor in `background.js`**

Add to `BACKGROUND_SCRIPT_FILES` near other step files:

```javascript
'background/steps/no-2fa-free-route.js',
```

Create executor after `upiRedeemExecutor` dependencies are available:

```javascript
const no2faFreeRouteExecutor = self.MultiPageBackgroundNo2faFreeRoute?.createNo2faFreeRouteExecutor({
  addLog,
  checkRegistrationUpiTrialEligibility: (...args) => upiRedeemExecutor.checkRegistrationUpiTrialEligibility(...args),
  completeNodeFromBackground,
  getCustomEmailPoolEntries,
  getState,
  readCurrentChatGptSessionForExport,
  setState,
  throwIfStopped,
});
```

Add to `stepExecutorsByKey`:

```javascript
'persist-no-2fa-free': (state) => no2faFreeRouteExecutor.executeNo2faFreeRoute(state),
```

- [ ] **Step 4: Pass no-2FA metadata through eligibility write**

In `background/steps/upi-redeem.js`, extend `buildCurrentUpiCredentialForMembership()`:

```javascript
verificationUrl: normalizeString(state.verificationUrl || state.emailVerificationUrl || ''),
recordedAt: Math.max(0, Math.floor(Number(state.recordedAt || state.no2faFreeRecordedAt) || 0)),
twoFactorEnabled: state.twoFactorEnabled === true || Boolean(state.totpMfaSecret || state.totpSecret),
no2faFreeRoute: state.no2faFreeRoute === true,
```

In `checkRegistrationUpiTrialEligibility()`, when calling `upsertTrialEligibleFreeCredential`, pass:

```javascript
verificationUrl: normalizeString(patch.verificationUrl || runtimeState.verificationUrl || ''),
recordedAt: Math.max(0, Math.floor(Number(patch.recordedAt || runtimeState.no2faFreeRecordedAt) || Date.now())),
twoFactorEnabled: patch.twoFactorEnabled === true,
no2faFreeRoute: patch.no2faFreeRoute === true,
```

- [ ] **Step 5: Run executor checks**

```powershell
node -e "const fs=require('fs'); const bg=fs.readFileSync('background.js','utf8'); if (!bg.includes('background/steps/no-2fa-free-route.js')) throw new Error('missing import'); if (!bg.includes(\"'persist-no-2fa-free'\")) throw new Error('missing executor map key'); const step=fs.readFileSync('background/steps/no-2fa-free-route.js','utf8'); if (!step.includes('createNo2faFreeRouteExecutor')) throw new Error('missing factory'); console.log('PASS no-2fa executor registration');"
node --check background/steps/no-2fa-free-route.js
node --check background/steps/upi-redeem.js
node --check background.js
```

Expected: all PASS/no output for `node --check`.

- [ ] **Step 6: Commit**

```powershell
git add background.js background/steps/no-2fa-free-route.js background/steps/upi-redeem.js
git commit -m "feat: persist no-2fa free route accounts"
```

---

### Task 3: Preserve No-2FA Free Fields In Result Storage

**Files:**
- Modify: `background/upi-credential-membership-checker.js:953-1022`, `background/upi-credential-membership-checker.js:1931-2097`

- [ ] **Step 1: Write a static failing check for fields**

```powershell
node -e "const fs=require('fs'); const src=fs.readFileSync('background/upi-credential-membership-checker.js','utf8'); for (const token of ['verificationUrl','recordedAt','no2faFreeRoute','twoFactorEnabled']) { if (!src.includes(token)) throw new Error('missing '+token); } console.log('PASS no-2fa fields present');"
```

Expected before implementation: FAIL for at least one field.

- [ ] **Step 2: Extend `normalizeResultItem()`**

Inside the `normalized` object returned by `normalizeResultItem(item)`, add:

```javascript
verificationUrl: normalizeString(item.verificationUrl || item.emailVerificationUrl || item.url),
recordedAt: Math.max(0, Math.floor(Number(item.recordedAt || item.no2faFreeRecordedAt) || 0)),
no2faFreeRoute: item.no2faFreeRoute === true,
twoFactorEnabled: item.twoFactorEnabled === true || Boolean(normalizeTotpSecret(item.totpMfaSecret)),
gptPassword: normalizeString(item.gptPassword || item.password),
```

Keep existing `password` behavior; do not require `password` for no-2FA records.

- [ ] **Step 3: Extend `upsertTrialEligibleFreeCredential()`**

Before building `nextItems`, compute:

```javascript
const verificationUrl = normalizeString(
  input.verificationUrl
  || credential.verificationUrl
  || credential.emailVerificationUrl
  || existingItem.verificationUrl
);
const recordedAt = Math.max(0, Math.floor(Number(
  input.recordedAt
  || credential.recordedAt
  || existingItem.recordedAt
  || Date.now()
) || Date.now()));
const no2faFreeRoute = input.no2faFreeRoute === true || credential.no2faFreeRoute === true || existingItem.no2faFreeRoute === true;
const twoFactorEnabled = input.twoFactorEnabled === true
  || credential.twoFactorEnabled === true
  || Boolean(credential.totpMfaSecret || input.totpMfaSecret || backupCredential.totpMfaSecret || existingItem.totpMfaSecret);
```

Add these fields to the object passed to `upsertResultItem()`:

```javascript
verificationUrl,
recordedAt,
no2faFreeRoute,
twoFactorEnabled,
gptPassword: normalizeString(credential.gptPassword || input.gptPassword || credential.password || input.password || backupCredential.password || existingItem.gptPassword || existingItem.password),
```

- [ ] **Step 4: Run checks**

```powershell
node -e "const fs=require('fs'); const src=fs.readFileSync('background/upi-credential-membership-checker.js','utf8'); for (const token of ['verificationUrl','recordedAt','no2faFreeRoute','twoFactorEnabled']) { if (!src.includes(token)) throw new Error('missing '+token); } console.log('PASS no-2fa fields present');"
node --check background/upi-credential-membership-checker.js
```

Expected: PASS/no syntax output.

- [ ] **Step 5: Commit**

```powershell
git add background/upi-credential-membership-checker.js
git commit -m "feat: preserve no-2fa free metadata"
```

---

### Task 4: Export And Import No-2FA Free Rows

**Files:**
- Modify: `background/upi-credential-membership-checker.js:1143-1186`, `background/upi-credential-membership-checker.js:6252-6319`
- Modify: `sidepanel/account-records-manager.js:4455-4524`

- [ ] **Step 1: Add export format check**

Use a static check that should fail before export logic is changed:

```powershell
node -e "const fs=require('fs'); const src=fs.readFileSync('background/upi-credential-membership-checker.js','utf8'); if (!src.includes('verificationUrl') || !src.includes('recordedAt')) throw new Error('missing no-2fa export fields'); if (!src.includes('no2faFreeRoute')) throw new Error('missing no-2fa export branch'); console.log('PASS no-2fa export markers present');"
```

Expected before implementation: FAIL if no no-2FA branch exists.

- [ ] **Step 2: Change `buildResultExportRows()` free branch**

In `buildResultExportRows()`, replace the Free password/2FA requirement:

```javascript
if (normalizedStatus !== 'failed' && (!item.password || !item.totpMfaSecret)) return false;
```

with:

```javascript
if (normalizedStatus !== 'failed') {
  const no2faExportable = normalizedStatus === 'free'
    && item.no2faFreeRoute === true
    && item.email
    && item.verificationUrl
    && item.accessToken;
  const password2faExportable = Boolean(item.password && item.totpMfaSecret);
  if (!no2faExportable && !password2faExportable) return false;
}
```

Inside the `normalizedStatus === 'free'` map branch, use:

```javascript
if (item.no2faFreeRoute === true && item.verificationUrl && item.accessToken) {
  const timestamp = Math.max(0, Math.floor(Number(item.recordedAt) || Date.parse(item.checkedAt || '') || Date.now()));
  return `${item.email}---${item.verificationUrl}---${item.accessToken}---${timestamp}`;
}
const timestamp = item.trialEligibilityCheckedAt || item.checkedAt || item.accessTokenUpdatedAt || '';
return `${item.email}---${item.password}---${item.totpMfaSecret}---${item.accessToken || ''}---${timestamp}`;
```

- [ ] **Step 3: Allow export counting for no-2FA Free**

In `exportUpiCredentialMembershipCheckResults()`, replace:

```javascript
if (status !== 'failed' && !Boolean(item.email && item.password && item.totpMfaSecret)) return false;
```

with the same `no2faExportable || password2faExportable` condition from Step 2.

- [ ] **Step 4: Update file naming for Free export**

When exporting Free rows, keep existing filename unless all exported rows are no-2FA. If all exported rows contain `---http`/`---https` and 4 segments, use:

```javascript
free: 'upi-membership-free-email-url-at',
```

If mixed, keep `upi-membership-free-password-2fa` to avoid breaking old workflows.

- [ ] **Step 5: Add import parser support if import path rejects four segments**

If current import Free TXT parser rejects `email---url---AT---timestamp`, update it to recognize:

```javascript
const [email, verificationUrl, accessToken, recordedAt] = line.split('---');
```

Set:

```javascript
{
  email,
  verificationUrl,
  accessToken,
  recordedAt: Number(recordedAt) || Date.now(),
  no2faFreeRoute: true,
  twoFactorEnabled: false,
  password: '',
  totpMfaSecret: '',
}
```

The likely import path is in `background/upi-credential-membership-checker.js` around `parseCredentialBackupText()` and `checkUpiCredentialMembershipBatch()`.

- [ ] **Step 6: Run export/import checks**

```powershell
node -e "const fs=require('fs'); const src=fs.readFileSync('background/upi-credential-membership-checker.js','utf8'); for (const token of ['no2faFreeRoute','verificationUrl','recordedAt','accessToken']) { if (!src.includes(token)) throw new Error('missing '+token); } console.log('PASS no-2fa export/import markers present');"
node --check background/upi-credential-membership-checker.js
node --check sidepanel/account-records-manager.js
```

Expected: PASS/no syntax output.

- [ ] **Step 7: Commit**

```powershell
git add background/upi-credential-membership-checker.js sidepanel/account-records-manager.js
git commit -m "feat: export no-2fa free accounts"
```

---

### Task 5: UI Display And Safety Labels

**Files:**
- Modify: `sidepanel/account-records-manager.js:1480-1780`, `sidepanel/account-records-manager.js:2300-2324`
- Modify: `sidepanel/sidepanel.js:7600-8300` if route-specific captions need refresh.

- [ ] **Step 1: Mark no-2FA rows in Free detail text**

In the row metadata builder that currently produces Free row details, add a label when `row.no2faFreeRoute === true`:

```javascript
const no2faLabel = row.no2faFreeRoute === true ? '免 2FA Free' : '';
```

Include it in detail/title parts only when non-empty.

- [ ] **Step 2: Ensure missing AT rule remains unchanged**

Do not count no-2FA rows without `accessToken` as redeemable. The existing redeemable filters should continue to require `accessToken`.

Add a static assertion command:

```powershell
node -e "const fs=require('fs'); const src=fs.readFileSync('sidepanel/account-records-manager.js','utf8'); if (!/accessToken/.test(src)) throw new Error('missing AT checks'); console.log('PASS AT checks still present');"
```

- [ ] **Step 3: Add route-specific sidepanel caption**

Near the new route selector, add a caption in HTML or dynamic text:

```text
免 2FA Free 路线会在第 5 步后读取邮箱、取码链接和 AT，检测有试用资格后直接进入 Free。
```

Do not add marketing-style explanatory blocks elsewhere.

- [ ] **Step 4: Run checks**

```powershell
node --check sidepanel/account-records-manager.js
node --check sidepanel/sidepanel.js
```

- [ ] **Step 5: Commit**

```powershell
git add sidepanel/account-records-manager.js sidepanel/sidepanel.html sidepanel/sidepanel.js
git commit -m "feat: label no-2fa free route records"
```

---

### Task 6: Regression Sweep And Release Prep

**Files:**
- Modify only if publishing: `manifest.json`, `sidepanel/sidepanel.html`, `Release.md`, `RELEASING.md`

- [ ] **Step 1: Run syntax sweep**

```powershell
$ErrorActionPreference = 'Stop'
$files = Get-ChildItem -Recurse -File -Include *.js,*.mjs | Where-Object { $_.FullName -notmatch '\\node_modules\\|\\release-artifacts\\|\\.git\\|\\.codegraph\\' }
foreach ($file in $files) { node --check $file.FullName | Out-Null }
"PASS node --check sweep ($($files.Count) files)"
```

Expected: `PASS node --check sweep (...)`.

- [ ] **Step 2: Run existing audits**

```powershell
node scripts/audit-smoke-tests.mjs
node scripts/audit-no-phone-sms.mjs
node scripts/audit-no-removed-network.mjs
```

Expected:

```text
PASS audit smoke checks completed with 0 warning(s).
No phone SMS signup remnants found.
No Removed Network remnants found.
```

- [ ] **Step 3: Manual smoke checklist**

Use the unpacked extension locally:

```text
1. Select 完整 2FA 路线.
2. Confirm workflow still shows 打开官网 -> 注册 -> 密码 -> 验证码 -> 资料 -> 设置 GPT 密码 -> 开通 2FA 并检测资格.
3. Select 免 2FA Free 路线.
4. Confirm workflow shows 打开官网 -> 注册 -> 密码 -> 验证码 -> 资料 -> 免 2FA 检测资格并进入 Free.
5. Run one account through step 5 on the no-2FA route.
6. Confirm logs say it reads email/link/AT and checks eligibility.
7. Confirm eligible account enters Free with AT and no 2FA secret.
8. Export Free and confirm row shape is email---verificationUrl---accessToken---timestamp.
9. Confirm UPI/IDEAL buttons count the no-2FA row only when AT exists.
```

- [ ] **Step 4: Commit any final fixes**

If validation changes files:

```powershell
git add <changed-files>
git commit -m "fix: stabilize no-2fa free route"
```

- [ ] **Step 5: Publish only after user asks**

When the user asks to publish, bump from the current version to the next patch version, then:

```powershell
git archive --format=zip --output=release-artifacts/cdk-redeem-only-extension-vNEXT.zip HEAD
git tag -a vNEXT -m "CDK Redeem Only VNEXT"
git push origin main
git push origin vNEXT
gh release create vNEXT release-artifacts/cdk-redeem-only-extension-vNEXT.zip --title "CDK Redeem Only VNEXT" --notes-file <notes-file> --latest
```

Also upload `tutorial.docx` if the Release should keep the tutorial asset.

---

## Self-Review

- Spec coverage: The plan covers the selectable route, no-2FA path after step 5, required eligibility check, Free record fields, four-part export format, import compatibility, UI labels, tests, and release steps.
- Placeholder scan: No task contains `TBD`, `TODO`, or unspecified “add appropriate handling” instructions.
- Type consistency: The route key is consistently `registrationFreeRoute`; allowed values are `full-2fa` and `no-2fa-free`; the new node key is consistently `persist-no-2fa-free`; Free metadata fields are `verificationUrl`, `accessToken`, `recordedAt`, `no2faFreeRoute`, and `twoFactorEnabled`.
