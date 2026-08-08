const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.self = globalThis;
delete globalThis.MultiPageBackgroundAutoRunSession;
require('../background/bootstrap/auto-run-session.js');

const { createAutoRunSessionRunner } = require('../background/auto-run/session-runner.js');
const { createAutoRunSessionManager } = globalThis.MultiPageBackgroundAutoRunSession;
const { createAutoRunSummaryBuilder } = require('../background/auto-run/summary-builder.js');
const { createAutoRunRetryPolicy } = require('../background/auto-run/retry-policy.js');
const { createAccountDeactivationReplacementHandler } = require('../background/auto-run/account-deactivation-replacement.js');

test('superseded auto-run sessions expose a distinct terminal code', () => {
  const manager = createAutoRunSessionManager({
    initialSessionId: 11,
    stopErrorMessage: 'STOP',
  });
  manager.setCurrentAutoRunSessionId(12);

  assert.throws(
    () => manager.throwIfAutoRunSessionStopped(11),
    (error) => error?.code === 'AUTO_RUN_SESSION_SUPERSEDED' && error?.message === 'STOP'
  );
});

test('superseded auto-run loop exits without clearing or stopping the newer session', async () => {
  let runtimeState = {
    autoRunActive: false,
    autoRunCurrentRun: 0,
    autoRunTotalRuns: 0,
    autoRunAttemptRun: 0,
    autoRunSessionId: 0,
  };
  let appState = { autoRunFallbackThreadIntervalMinutes: 0, autoRunSessionId: 0 };
  const broadcasts = [];
  let finalSummaryCalls = 0;
  const summaryBuilder = createAutoRunSummaryBuilder({ addLog: async () => {} });
  const runner = createAutoRunSessionRunner({
    ...summaryBuilder,
    addLog: async () => {},
    appendAccountRunRecord: async () => ({}),
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 3,
    AUTO_RUN_RETRY_DELAY_MS: 1,
    AUTO_RUN_TIMER_KIND_BEFORE_RETRY: 'before_retry',
    AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS: 'between_rounds',
    broadcastAutoRunStatus: async (phase, payload) => broadcasts.push({ phase, payload }),
    broadcastStopToContentScripts: async () => {},
    cancelPendingCommands: () => {},
    clearStopRequest: () => {},
    createAutoRunRoundLogSnapshotMarker: () => ({}),
    createAutoRunSessionId: () => 123,
    ensureHotmailMailboxReadyForAutoRunRound: null,
    evaluateAttemptFailure: () => ({ reason: 'late failure' }),
    getAutoRunRoundSnapshotReason: () => '',
    getAutoRunRoundSnapshotStatus: () => 'failed',
    getAutoRunStatusPayload: (phase, payload) => ({
      autoRunPhase: phase,
      autoRunCurrentRun: payload.currentRun,
      autoRunTotalRuns: payload.totalRuns,
      autoRunAttemptRun: payload.attemptRun,
      autoRunSessionId: payload.sessionId,
    }),
    getErrorMessage: (error) => error?.message || String(error || ''),
    getFirstUnfinishedNodeId: () => null,
    getMaxAttemptsForRound: () => 1,
    getPendingAutoRunTimerPlan: () => null,
    getRunningNodeIds: () => [],
    getState: async () => appState,
    getStopRequested: () => false,
    hasSavedNodeProgress: () => false,
    isStopError: () => false,
    launchAutoRunTimerPlan: async () => false,
    logAutoRunFinalSummary: async () => { finalSummaryCalls += 1; },
    normalizeAutoRunFallbackThreadIntervalMinutes: () => 0,
    persistAutoRunTimerPlan: async () => {},
    replayPreviousSuccessfulAutoRunRoundLogSnapshot: async () => {},
    resetState: async () => { appState = {}; },
    resolveAutoRunAccountRecordStatus: (status) => status,
    runAutoSequenceFromNode: async () => {
      runtimeState = { ...runtimeState, autoRunActive: true, autoRunSessionId: 456 };
      appState = { ...appState, autoRunSessionId: 456 };
      const error = new Error('late failure');
      error.code = 'AUTO_RUN_SESSION_SUPERSEDED';
      throw error;
    },
    runtime: {
      get: () => runtimeState,
      set: (patch) => { runtimeState = { ...runtimeState, ...patch }; },
    },
    saveAutoRunRoundLogSnapshot: async () => null,
    selectFailureAction: () => ({ code: 'fail_generic' }),
    setState: async (patch) => { appState = { ...appState, ...patch }; },
    sleepWithStop: async () => {},
    throwIfAutoRunSessionStopped: () => {},
    waitForRunningNodesToFinish: async () => appState,
    chrome: { runtime: { sendMessage: async () => {} } },
  });

  await runner.autoRunLoop(1);

  assert.equal(runtimeState.autoRunSessionId, 456);
  assert.equal(runtimeState.autoRunActive, true);
  assert.equal(finalSummaryCalls, 0);
  assert.equal(broadcasts.some(({ phase, payload }) => (
    ['stopped', 'complete'].includes(phase) && Number(payload?.sessionId) === 0
  )), false);
});

test('auto-run resume keeps retry attempt on the original round when next round has no history', async () => {
  const capturedRuns = [];
  let runtimeState = {
    autoRunActive: false,
    autoRunCurrentRun: 0,
    autoRunTotalRuns: 0,
    autoRunAttemptRun: 0,
    autoRunSessionId: 0,
  };
  let appState = {
    autoRunFallbackThreadIntervalMinutes: 0,
    autoRunSessionId: 123,
  };
  const summaryBuilder = createAutoRunSummaryBuilder({ addLog: async () => {} });
  const runner = createAutoRunSessionRunner({
    ...summaryBuilder,
    addLog: async () => {},
    appendAccountRunRecord: async () => ({}),
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 3,
    AUTO_RUN_RETRY_DELAY_MS: 1,
    AUTO_RUN_TIMER_KIND_BEFORE_RETRY: 'before_retry',
    AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS: 'between_rounds',
    broadcastAutoRunStatus: async () => {},
    broadcastStopToContentScripts: async () => {},
    cancelPendingCommands: () => {},
    clearStopRequest: () => {},
    createAutoRunRoundLogSnapshotMarker: () => ({}),
    createAutoRunSessionId: () => 123,
    ensureHotmailMailboxReadyForAutoRunRound: null,
    evaluateAttemptFailure: () => ({ reason: 'failed' }),
    getAutoRunRoundSnapshotReason: () => '',
    getAutoRunRoundSnapshotStatus: () => 'stopped',
    getAutoRunStatusPayload: (phase, payload) => ({
      autoRunPhase: phase,
      autoRunCurrentRun: payload.currentRun,
      autoRunTotalRuns: payload.totalRuns,
      autoRunAttemptRun: payload.attemptRun,
      autoRunSessionId: payload.sessionId,
    }),
    getAutoRunRoundSnapshotReason: () => '',
    getAutoRunRoundSnapshotStatus: () => 'success',
    getErrorMessage: (error) => error?.message || String(error || ''),
    getFirstUnfinishedNodeId: () => null,
    getMaxAttemptsForRound: () => 3,
    getPendingAutoRunTimerPlan: () => null,
    getRunningNodeIds: () => [],
    getState: async () => appState,
    getStopRequested: () => false,
    hasSavedNodeProgress: () => false,
    isStopError: (error) => error?.message === 'STOP',
    launchAutoRunTimerPlan: async () => false,
    logAutoRunFinalSummary: async () => {},
    normalizeAutoRunFallbackThreadIntervalMinutes: () => 0,
    persistAutoRunTimerPlan: async () => {},
    replayPreviousSuccessfulAutoRunRoundLogSnapshot: async () => {},
    resetState: async () => {
      appState = {};
    },
    resolveAutoRunAccountRecordStatus: (status) => status,
    runAutoSequenceFromNode: async (_nodeId, context) => {
      capturedRuns.push(context);
      throw new Error('STOP');
    },
    runtime: {
      get: () => runtimeState,
      set: (patch) => {
        runtimeState = { ...runtimeState, ...patch };
      },
    },
    saveAutoRunRoundLogSnapshot: async () => null,
    selectFailureAction: () => ({ code: 'retry_generic' }),
    setState: async (patch) => {
      appState = { ...appState, ...patch };
    },
    sleepWithStop: async () => {},
    throwIfAutoRunSessionStopped: () => {},
    waitForRunningNodesToFinish: async () => appState,
    chrome: {
      runtime: {
        sendMessage: async () => {},
      },
    },
  });

  await runner.autoRunLoop(2, {
    autoRunSessionId: 123,
    mode: 'continue',
    resumeCurrentRun: 2,
    resumeAttemptRun: 2,
    resumeRoundSummaries: [
      { round: 1, status: 'pending', attempts: 1, failureReasons: ['first failed'] },
      { round: 2, status: 'pending', attempts: 0, failureReasons: [] },
    ],
  });

  assert.equal(capturedRuns.length, 1);
  assert.equal(capturedRuns[0].targetRun, 1);
  assert.equal(capturedRuns[0].attemptRuns, 2);
});

test('auto-run preserves custom email pool state and blocks already-registered emails', async () => {
  const capturedStates = [];
  const blockedCalls = [];
  let runtimeState = {
    autoRunActive: false,
    autoRunCurrentRun: 0,
    autoRunTotalRuns: 0,
    autoRunAttemptRun: 0,
    autoRunSessionId: 0,
  };
  let appState = {
    autoRunFallbackThreadIntervalMinutes: 0,
    email: 'first@example.com',
    emailGenerator: 'custom-pool',
    customEmailPoolEntries: [
      { id: 'entry-1', email: 'first@example.com', enabled: true, used: false },
      { id: 'entry-2', email: 'second@example.com', enabled: true, used: false },
    ],
    customEmailPool: ['first@example.com', 'second@example.com'],
    selectedCustomEmailPoolEmail: 'first@example.com',
  };
  const summaryBuilder = createAutoRunSummaryBuilder({ addLog: async () => {} });
  const runner = createAutoRunSessionRunner({
    ...summaryBuilder,
    addLog: async () => {},
    appendAccountRunRecord: async () => ({}),
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 3,
    AUTO_RUN_RETRY_DELAY_MS: 1,
    AUTO_RUN_TIMER_KIND_BEFORE_RETRY: 'before_retry',
    AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS: 'between_rounds',
    broadcastAutoRunStatus: async () => {},
    broadcastStopToContentScripts: async () => {},
    cancelPendingCommands: () => {},
    clearStopRequest: () => {},
    createAutoRunRoundLogSnapshotMarker: () => ({}),
    createAutoRunSessionId: () => 123,
    ensureHotmailMailboxReadyForAutoRunRound: null,
    evaluateAttemptFailure: () => ({ reason: 'SIGNUP_USER_ALREADY_EXISTS::exists' }),
    getAutoRunRoundSnapshotReason: () => '',
    getAutoRunRoundSnapshotStatus: () => 'failed',
    getAutoRunStatusPayload: (phase, payload) => ({
      autoRunPhase: phase,
      autoRunCurrentRun: payload.currentRun,
      autoRunTotalRuns: payload.totalRuns,
      autoRunAttemptRun: payload.attemptRun,
      autoRunSessionId: payload.sessionId,
    }),
    getErrorMessage: (error) => error?.message || String(error || ''),
    getFirstUnfinishedNodeId: () => null,
    getMaxAttemptsForRound: () => 1,
    getPendingAutoRunTimerPlan: () => null,
    getRunningNodeIds: () => [],
    getState: async () => appState,
    getStopRequested: () => false,
    hasSavedNodeProgress: () => false,
    isStopError: () => false,
    launchAutoRunTimerPlan: async () => false,
    logAutoRunFinalSummary: async () => {},
    markCurrentRegistrationAccountRegistrationBlocked: async (state, options) => {
      blockedCalls.push({ state, options });
    },
    normalizeAutoRunFallbackThreadIntervalMinutes: () => 0,
    persistAutoRunTimerPlan: async () => {},
    replayPreviousSuccessfulAutoRunRoundLogSnapshot: async () => {},
    resetState: async () => {
      appState = {};
    },
    resolveAutoRunAccountRecordStatus: (status) => status,
    runAutoSequenceFromNode: async () => {
      capturedStates.push(JSON.parse(JSON.stringify(appState)));
      throw new Error('SIGNUP_USER_ALREADY_EXISTS::exists');
    },
    runtime: {
      get: () => runtimeState,
      set: (patch) => {
        runtimeState = { ...runtimeState, ...patch };
      },
    },
    saveAutoRunRoundLogSnapshot: async () => null,
    selectFailureAction: () => ({ code: 'fail_signup_user_already_exists' }),
    setState: async (patch) => {
      appState = { ...appState, ...patch };
    },
    sleepWithStop: async () => {},
    throwIfAutoRunSessionStopped: () => {},
    waitForRunningNodesToFinish: async () => appState,
    chrome: {
      runtime: {
        sendMessage: async () => {},
      },
    },
  });

  await runner.autoRunLoop(1);

  assert.equal(capturedStates.length, 1);
  assert.equal(capturedStates[0].selectedCustomEmailPoolEmail, 'first@example.com');
  assert.deepEqual(capturedStates[0].customEmailPool, ['first@example.com', 'second@example.com']);
  assert.equal(capturedStates[0].customEmailPoolEntries.length, 2);
  assert.equal(blockedCalls.length, 1);
  assert.equal(blockedCalls[0].state.selectedCustomEmailPoolEmail, 'first@example.com');
  assert.equal(blockedCalls[0].options.reasonCode, 'user_already_exists');
});

test('auto-run replaces a deactivated account in the same round without consuming retry attempts', async () => {
  const logs = [];
  const marked = [];
  const removedTabBatches = [];
  const attemptContexts = [];
  let runtimeState = {
    autoRunActive: false,
    autoRunCurrentRun: 0,
    autoRunTotalRuns: 0,
    autoRunAttemptRun: 0,
    autoRunSessionId: 0,
  };
  let appState = {
    autoRunFallbackThreadIntervalMinutes: 0,
    emailGenerator: 'custom-pool',
    customEmailPoolEntries: [
      { id: 'entry-1', email: 'first@example.com', enabled: true, used: false },
      { id: 'entry-2', email: 'second@example.com', enabled: true, used: false },
    ],
    customEmailPool: ['first@example.com', 'second@example.com'],
    selectedCustomEmailPoolEmail: 'first@example.com',
  };
  const summaryBuilder = createAutoRunSummaryBuilder({
    addLog: async (message) => logs.push(message),
  });
  const policy = createAutoRunRetryPolicy({
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 0,
    getErrorMessage: (error) => error?.message || String(error || ''),
  });
  const runner = createAutoRunSessionRunner({
    ...summaryBuilder,
    ...policy,
    addLog: async (message) => logs.push(message),
    appendAccountRunRecord: async () => ({}),
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 0,
    AUTO_RUN_RETRY_DELAY_MS: 1000,
    AUTO_RUN_TIMER_KIND_BEFORE_RETRY: 'before_retry',
    AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS: 'between_rounds',
    broadcastAutoRunStatus: async () => {},
    broadcastStopToContentScripts: async () => {},
    cancelPendingCommands: () => {},
    clearStopRequest: () => {},
    createAutoRunRoundLogSnapshotMarker: () => ({}),
    createAutoRunSessionId: () => 789,
    ensureHotmailMailboxReadyForAutoRunRound: null,
    getAutoRunRoundSnapshotReason: () => '',
    getAutoRunRoundSnapshotStatus: () => 'success',
    getAutoRunStatusPayload: (phase, payload) => ({
      autoRunPhase: phase,
      autoRunCurrentRun: payload.currentRun,
      autoRunTotalRuns: payload.totalRuns,
      autoRunAttemptRun: payload.attemptRun,
      autoRunSessionId: payload.sessionId,
    }),
    getErrorMessage: (error) => error?.message || String(error || ''),
    getFirstUnfinishedNodeId: () => null,
    getPendingAutoRunTimerPlan: () => null,
    getRunningNodeIds: () => [],
    getState: async () => appState,
    getStopRequested: () => false,
    hasSavedNodeProgress: () => false,
    isStopError: () => false,
    launchAutoRunTimerPlan: async () => false,
    markCurrentRegistrationAccountDeactivated: async (state, options) => {
      marked.push({ state: JSON.parse(JSON.stringify(state)), options });
      const nextEntries = state.customEmailPoolEntries.map((entry) => (
        entry.email === options.email
          ? {
              ...entry,
              registrationBlocked: true,
              registrationBlockedReasonCode: 'account_deactivated',
            }
          : entry
      ));
      appState = {
        ...state,
        email: null,
        customEmailPoolEntries: nextEntries,
        customEmailPool: ['second@example.com'],
        selectedCustomEmailPoolEmail: 'second@example.com',
      };
      return {
        updated: true,
        email: options.email,
        nextEmail: 'second@example.com',
        poolUpdated: true,
      };
    },
    normalizeAutoRunFallbackThreadIntervalMinutes: () => 0,
    persistAutoRunTimerPlan: async () => {},
    replayPreviousSuccessfulAutoRunRoundLogSnapshot: async () => {},
    resetState: async () => {
      appState = {};
    },
    runAutoSequenceFromNode: async (_nodeId, context) => {
      attemptContexts.push(context);
      if (attemptContexts.length === 1) {
        appState = {
          ...appState,
          email: 'first@example.com',
          registrationEmailState: { current: 'first@example.com' },
          tabRegistry: {
            'signup-page': { tabId: 41 },
            'mail-page': { tabId: 42 },
          },
        };
        const error = new Error('ACCOUNT_DEACTIVATED::account is unavailable');
        error.code = 'ACCOUNT_DEACTIVATED';
        error.retryable = false;
        error.accountEmail = 'first@example.com';
        error.nextAccountEmail = 'second@example.com';
        throw error;
      }
      assert.equal(appState.selectedCustomEmailPoolEmail, 'second@example.com');
    },
    runtime: {
      get: () => runtimeState,
      set: (patch) => {
        runtimeState = { ...runtimeState, ...patch };
      },
    },
    saveAutoRunRoundLogSnapshot: async () => null,
    setState: async (patch) => {
      appState = { ...appState, ...patch };
    },
    sleepWithStop: async () => {},
    throwIfAutoRunSessionStopped: () => {},
    waitForRunningNodesToFinish: async () => appState,
    chrome: {
      runtime: { sendMessage: async () => {} },
      tabs: {
        remove: async (tabIds) => removedTabBatches.push(tabIds),
      },
    },
  });

  await runner.autoRunLoop(1, { autoRunSkipFailures: false });

  assert.equal(attemptContexts.length, 2);
  assert.deepEqual(attemptContexts.map((context) => context.attemptRuns), [1, 1]);
  assert.deepEqual(attemptContexts.map((context) => context.targetRun), [1, 1]);
  assert.equal(marked.length, 1);
  assert.equal(marked[0].options.email, 'first@example.com');
  assert.deepEqual(removedTabBatches, [[41, 42]]);
  assert.equal(logs.some((message) => message.includes('当前目标次数不变')), true);
  assert.equal(logs.some((message) => message.includes('使用下一个账号')), true);
});

test('deactivated account replacement stops when the account source is explicitly exhausted', async () => {
  const logs = [];
  const phases = [];
  const failedReasons = [];
  const removedTabs = [];
  const state = {
    email: 'last@example.com',
    customEmailPoolEntries: [{ email: 'last@example.com', enabled: true, used: false }],
    customEmailPool: ['unexpected-next@example.com'],
    tabRegistry: { auth: { tabId: 71 } },
  };
  const replaceDeactivatedAccount = createAccountDeactivationReplacementHandler({
    addLog: async (message) => logs.push(message),
    broadcastAutoRunStatus: async (phase) => phases.push(phase),
    broadcastStopToContentScripts: async () => {},
    cancelPendingCommands: () => {},
    getState: async () => state,
    markCurrentRegistrationAccountDeactivated: async () => ({ nextEmail: 'unexpected-next@example.com' }),
    chrome: { tabs: { remove: async (tabIds) => removedTabs.push(tabIds) } },
  });
  const error = Object.assign(new Error('ACCOUNT_DEACTIVATED::account is unavailable'), {
    code: 'ACCOUNT_DEACTIVATED',
    accountEmail: 'last@example.com',
    accountSourceExhausted: true,
  });

  const result = await replaceDeactivatedAccount({
    error,
    targetRun: 1,
    totalRuns: 3,
    attemptRun: 1,
    sessionId: 789,
    seenEmails: new Set(),
    markRoundFailed: async (reason) => failedReasons.push(reason),
  });

  assert.equal(result.shouldStop, true);
  assert.equal(result.replacementCount, 1);
  assert.deepEqual(removedTabs, [[71]]);
  assert.equal(phases.includes('stopped'), true);
  assert.equal(failedReasons.some((reason) => reason.includes('账号池中已无下一个可用账号')), true);
  assert.equal(logs.some((message) => message.includes('自动运行已停止')), true);
});

test('auto-run stops immediately when the custom email pool is exhausted', async () => {
  const logs = [];
  const phases = [];
  let attempts = 0;
  let runtimeState = {
    autoRunActive: false,
    autoRunCurrentRun: 0,
    autoRunTotalRuns: 0,
    autoRunAttemptRun: 0,
    autoRunSessionId: 0,
  };
  let appState = { autoRunFallbackThreadIntervalMinutes: 0 };
  const summaryBuilder = createAutoRunSummaryBuilder({
    addLog: async (message) => logs.push(message),
  });
  const runner = createAutoRunSessionRunner({
    ...summaryBuilder,
    addLog: async (message) => logs.push(message),
    appendAccountRunRecord: async () => ({}),
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 3,
    AUTO_RUN_RETRY_DELAY_MS: 1,
    AUTO_RUN_TIMER_KIND_BEFORE_RETRY: 'before_retry',
    AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS: 'between_rounds',
    broadcastAutoRunStatus: async (phase) => phases.push(phase),
    broadcastStopToContentScripts: async () => {},
    cancelPendingCommands: () => {},
    clearStopRequest: () => {},
    createAutoRunRoundLogSnapshotMarker: () => ({}),
    createAutoRunSessionId: () => 456,
    ensureHotmailMailboxReadyForAutoRunRound: null,
    evaluateAttemptFailure: (options) => ({
      reason: options.error.message,
      blockedByCustomEmailPoolEmpty: true,
      canRetry: false,
      autoRunSkipFailures: true,
    }),
    getAutoRunRoundSnapshotReason: () => '',
    getAutoRunRoundSnapshotStatus: () => 'failed',
    getAutoRunStatusPayload: (phase, payload) => ({
      autoRunPhase: phase,
      autoRunCurrentRun: payload.currentRun,
      autoRunTotalRuns: payload.totalRuns,
      autoRunAttemptRun: payload.attemptRun,
      autoRunSessionId: payload.sessionId,
    }),
    getErrorMessage: (error) => error?.message || String(error || ''),
    getFirstUnfinishedNodeId: () => null,
    getMaxAttemptsForRound: () => 4,
    getPendingAutoRunTimerPlan: () => null,
    getRunningNodeIds: () => [],
    getState: async () => appState,
    getStopRequested: () => false,
    hasSavedNodeProgress: () => false,
    isStopError: () => false,
    launchAutoRunTimerPlan: async () => false,
    logAutoRunFinalSummary: async () => {},
    normalizeAutoRunFallbackThreadIntervalMinutes: () => 0,
    persistAutoRunTimerPlan: async () => {},
    replayPreviousSuccessfulAutoRunRoundLogSnapshot: async () => {},
    resetState: async () => {
      appState = {};
    },
    resolveAutoRunAccountRecordStatus: (status) => status,
    runAutoSequenceFromNode: async () => {
      attempts += 1;
      throw new Error('CUSTOM_EMAIL_POOL_EXHAUSTED::自定义邮箱池没有可用邮箱。');
    },
    runtime: {
      get: () => runtimeState,
      set: (patch) => {
        runtimeState = { ...runtimeState, ...patch };
      },
    },
    saveAutoRunRoundLogSnapshot: async () => null,
    selectFailureAction: () => ({
      code: 'fail_custom_email_pool_empty',
      shouldFailRound: true,
      shouldStop: true,
    }),
    setState: async (patch) => {
      appState = { ...appState, ...patch };
    },
    sleepWithStop: async () => {},
    throwIfAutoRunSessionStopped: () => {},
    waitForRunningNodesToFinish: async () => appState,
    chrome: {
      runtime: {
        sendMessage: async () => {},
      },
    },
  });

  await runner.autoRunLoop(3, { autoRunSkipFailures: true });

  assert.equal(attempts, 1);
  assert.equal(phases.includes('stopped'), true);
  assert.equal(logs.some((message) => message.includes('没有可用邮箱')), true);
});

async function runPreservedSignupSessionFailure(error) {
  const logs = [];
  const phases = [];
  let attempts = 0;
  let runtimeState = {
    autoRunActive: false,
    autoRunCurrentRun: 0,
    autoRunTotalRuns: 0,
    autoRunAttemptRun: 0,
    autoRunSessionId: 0,
  };
  let appState = {
    autoRunFallbackThreadIntervalMinutes: 0,
    emailGenerator: 'custom-pool',
    selectedCustomEmailPoolEmail: 'current@example.com',
    customEmailPool: ['current@example.com', 'next@example.com'],
  };
  const summaryBuilder = createAutoRunSummaryBuilder({ addLog: async (message) => logs.push(message) });
  const policy = createAutoRunRetryPolicy({
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 3,
    getErrorMessage: (error) => error?.message || String(error || ''),
  });
  const runner = createAutoRunSessionRunner({
    ...summaryBuilder,
    addLog: async (message) => logs.push(message),
    appendAccountRunRecord: async () => ({}),
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 3,
    AUTO_RUN_RETRY_DELAY_MS: 1,
    AUTO_RUN_TIMER_KIND_BEFORE_RETRY: 'before_retry',
    AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS: 'between_rounds',
    broadcastAutoRunStatus: async (phase) => phases.push(phase),
    broadcastStopToContentScripts: async () => {},
    cancelPendingCommands: () => {},
    clearStopRequest: () => {},
    createAutoRunRoundLogSnapshotMarker: () => ({}),
    createAutoRunSessionId: () => 654,
    ensureHotmailMailboxReadyForAutoRunRound: null,
    evaluateAttemptFailure: policy.evaluateAttemptFailure,
    getAutoRunRoundSnapshotReason: () => '',
    getAutoRunRoundSnapshotStatus: () => 'failed',
    getAutoRunStatusPayload: (phase, payload) => ({
      autoRunPhase: phase,
      autoRunCurrentRun: payload.currentRun,
      autoRunTotalRuns: payload.totalRuns,
      autoRunAttemptRun: payload.attemptRun,
      autoRunSessionId: payload.sessionId,
    }),
    getErrorMessage: (error) => error?.message || String(error || ''),
    getFirstUnfinishedNodeId: () => null,
    getMaxAttemptsForRound: policy.getMaxAttemptsForRound,
    getPendingAutoRunTimerPlan: () => null,
    getRunningNodeIds: () => [],
    getState: async () => appState,
    getStopRequested: () => false,
    hasSavedNodeProgress: () => false,
    isStopError: () => false,
    launchAutoRunTimerPlan: async () => false,
    logAutoRunFinalSummary: async () => {},
    normalizeAutoRunFallbackThreadIntervalMinutes: () => 0,
    persistAutoRunTimerPlan: async () => {},
    replayPreviousSuccessfulAutoRunRoundLogSnapshot: async () => {},
    resetState: async () => {},
    resolveAutoRunAccountRecordStatus: (status) => status,
    runAutoSequenceFromNode: async () => {
      attempts += 1;
      throw error;
    },
    runtime: {
      get: () => runtimeState,
      set: (patch) => { runtimeState = { ...runtimeState, ...patch }; },
    },
    saveAutoRunRoundLogSnapshot: async () => null,
    selectFailureAction: policy.selectFailureAction,
    setState: async (patch) => { appState = { ...appState, ...patch }; },
    sleepWithStop: async () => {},
    throwIfAutoRunSessionStopped: () => {},
    waitForRunningNodesToFinish: async () => appState,
    chrome: { runtime: { sendMessage: async () => {} } },
  });

  await runner.autoRunLoop(3, { autoRunSkipFailures: true });

  return { appState, attempts, logs, phases };
}

test('auto-run does not restart or select another email after an uncertain email submit', async () => {
  const error = new Error('SIGNUP_EMAIL_SUBMIT_UNCERTAIN::unknown post-email page state');
  error.code = 'SIGNUP_EMAIL_SUBMIT_UNCERTAIN';
  error.preserveSignupSession = true;
  const { appState, attempts, logs, phases } = await runPreservedSignupSessionFailure(error);

  assert.equal(attempts, 1);
  assert.equal(phases.includes('stopped'), true);
  assert.equal(appState.selectedCustomEmailPoolEmail, 'current@example.com');
  assert.equal(logs.some((message) => message.includes('不会清理 Cookie、切换邮箱或重新提交邮箱')), true);
});

test('auto-run keeps the current tab and email after a reconstructed step 4 failure', async () => {
  const error = new Error('SIGNUP_EXISTING_TOTP_LOGIN_FAILED::2FA login result is unknown');
  const { appState, attempts, logs, phases } = await runPreservedSignupSessionFailure(error);

  assert.equal(attempts, 1);
  assert.equal(phases.includes('stopped'), true);
  assert.equal(appState.selectedCustomEmailPoolEmail, 'current@example.com');
  assert.equal(logs.some((message) => message.includes('步骤 4')), true);
  assert.equal(logs.some((message) => message.includes('不会清理 Cookie、切换邮箱或重新注册')), true);
});

test('auto-run stops at step 6 after code-fetch exhaustion instead of restarting the round', async () => {
  const error = new Error('SET_GPT_PASSWORD_CODE_FETCH_UNCERTAIN::redacted');
  error.code = 'SET_GPT_PASSWORD_CODE_FETCH_UNCERTAIN';
  error.retryable = false;
  error.preserveSignupSession = true;
  const { appState, attempts, logs, phases } = await runPreservedSignupSessionFailure(error);

  assert.equal(attempts, 1);
  assert.equal(phases.includes('stopped'), true);
  assert.equal(appState.selectedCustomEmailPoolEmail, 'current@example.com');
  assert.equal(logs.some((message) => message.includes('自动重试：')), false);
  assert.equal(logs.some((message) => message.includes('重新执行步骤 6')), true);
});

test('auto-run parks cleanly when a workflow node schedules a timer resume', async () => {
  const phases = [];
  let attempts = 0;
  let runtimeState = {
    autoRunActive: false,
    autoRunCurrentRun: 0,
    autoRunTotalRuns: 0,
    autoRunAttemptRun: 0,
    autoRunSessionId: 0,
  };
  let appState = { autoRunFallbackThreadIntervalMinutes: 0 };
  const summaryBuilder = createAutoRunSummaryBuilder({ addLog: async () => {} });
  const runner = createAutoRunSessionRunner({
    ...summaryBuilder,
    addLog: async () => {},
    appendAccountRunRecord: async () => ({}),
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 3,
    AUTO_RUN_RETRY_DELAY_MS: 1,
    AUTO_RUN_TIMER_KIND_BEFORE_RETRY: 'before_retry',
    AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS: 'between_rounds',
    broadcastAutoRunStatus: async (phase) => phases.push(phase),
    broadcastStopToContentScripts: async () => {},
    cancelPendingCommands: () => {},
    clearStopRequest: () => {},
    createAutoRunRoundLogSnapshotMarker: () => ({}),
    createAutoRunSessionId: () => 789,
    ensureHotmailMailboxReadyForAutoRunRound: null,
    evaluateAttemptFailure: () => {
      throw new Error('should not evaluate parked timer errors');
    },
    getAutoRunRoundSnapshotReason: () => '',
    getAutoRunRoundSnapshotStatus: () => 'failed',
    getAutoRunStatusPayload: (phase, payload) => ({
      autoRunPhase: phase,
      autoRunCurrentRun: payload.currentRun,
      autoRunTotalRuns: payload.totalRuns,
      autoRunAttemptRun: payload.attemptRun,
      autoRunSessionId: payload.sessionId,
    }),
    getErrorMessage: (error) => error?.message || String(error || ''),
    getFirstUnfinishedNodeId: () => null,
    getMaxAttemptsForRound: () => 4,
    getPendingAutoRunTimerPlan: () => null,
    getRunningNodeIds: () => [],
    getState: async () => appState,
    getStopRequested: () => false,
    hasSavedNodeProgress: () => false,
    isStopError: () => false,
    launchAutoRunTimerPlan: async () => false,
    logAutoRunFinalSummary: async () => {
      throw new Error('parked runs should not produce a final summary');
    },
    normalizeAutoRunFallbackThreadIntervalMinutes: () => 0,
    persistAutoRunTimerPlan: async () => {},
    replayPreviousSuccessfulAutoRunRoundLogSnapshot: async () => {},
    resetState: async () => {
      appState = {};
    },
    resolveAutoRunAccountRecordStatus: (status) => status,
    runAutoSequenceFromNode: async () => {
      attempts += 1;
      const error = new Error('AUTO_RUN_PARKED_BY_TIMER::waiting');
      error.autoRunParkedByTimer = true;
      throw error;
    },
    runtime: {
      get: () => runtimeState,
      set: (patch) => {
        runtimeState = { ...runtimeState, ...patch };
      },
    },
    saveAutoRunRoundLogSnapshot: async () => null,
    selectFailureAction: () => {
      throw new Error('should not select failure action for parked timer errors');
    },
    setState: async (patch) => {
      appState = { ...appState, ...patch };
    },
    sleepWithStop: async () => {},
    throwIfAutoRunSessionStopped: () => {},
    waitForRunningNodesToFinish: async () => appState,
    chrome: {
      runtime: {
        sendMessage: async () => {},
      },
    },
  });

  await runner.autoRunLoop(2);

  assert.equal(attempts, 1);
  assert.equal(runtimeState.autoRunActive, false);
  assert.equal(phases.includes('complete'), false);
  assert.equal(phases.includes('stopped'), false);
});

test('manual stop does not replay a previous round log snapshot', async () => {
  let stopRequested = false;
  let replayCalls = 0;
  let runtimeState = {
    autoRunActive: false,
    autoRunCurrentRun: 0,
    autoRunTotalRuns: 0,
    autoRunAttemptRun: 0,
    autoRunSessionId: 0,
  };
  let appState = { autoRunFallbackThreadIntervalMinutes: 0 };
  const summaryBuilder = createAutoRunSummaryBuilder({ addLog: async () => {} });
  const runner = createAutoRunSessionRunner({
    ...summaryBuilder,
    addLog: async () => {},
    appendAccountRunRecord: async () => ({}),
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 3,
    AUTO_RUN_RETRY_DELAY_MS: 1,
    AUTO_RUN_TIMER_KIND_BEFORE_RETRY: 'before_retry',
    AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS: 'between_rounds',
    broadcastAutoRunStatus: async () => {},
    broadcastStopToContentScripts: async () => {},
    cancelPendingCommands: () => {},
    clearStopRequest: () => { stopRequested = false; },
    createAutoRunRoundLogSnapshotMarker: () => ({}),
    createAutoRunSessionId: () => 901,
    ensureHotmailMailboxReadyForAutoRunRound: null,
    evaluateAttemptFailure: () => {
      throw new Error('manual stop must bypass failure evaluation');
    },
    getAutoRunRoundSnapshotReason: () => '',
    getAutoRunRoundSnapshotStatus: (_summary, flags) => flags.stoppedEarly ? 'stopped' : 'success',
    getAutoRunStatusPayload: (phase, payload) => ({
      autoRunPhase: phase,
      autoRunCurrentRun: payload.currentRun,
      autoRunTotalRuns: payload.totalRuns,
      autoRunAttemptRun: payload.attemptRun,
      autoRunSessionId: payload.sessionId,
    }),
    getErrorMessage: (error) => error?.message || String(error || ''),
    getFirstUnfinishedNodeId: () => null,
    getMaxAttemptsForRound: () => 1,
    getPendingAutoRunTimerPlan: () => null,
    getRunningNodeIds: () => [],
    getState: async () => appState,
    getStopRequested: () => stopRequested,
    hasSavedNodeProgress: () => false,
    isStopError: (error) => error?.message === 'STOP',
    launchAutoRunTimerPlan: async () => false,
    logAutoRunFinalSummary: async () => {},
    normalizeAutoRunFallbackThreadIntervalMinutes: () => 0,
    persistAutoRunTimerPlan: async () => {},
    replayPreviousSuccessfulAutoRunRoundLogSnapshot: async () => { replayCalls += 1; },
    resetState: async () => { appState = {}; },
    resolveAutoRunAccountRecordStatus: (status) => status,
    runAutoSequenceFromNode: async (_nodeId, context) => {
      if (context.targetRun === 2) {
        stopRequested = true;
        throw new Error('STOP');
      }
    },
    runtime: {
      get: () => runtimeState,
      set: (patch) => { runtimeState = { ...runtimeState, ...patch }; },
    },
    saveAutoRunRoundLogSnapshot: async ({ round }) => ({
      logCount: 1,
      originalLogCount: 1,
      round,
      truncated: false,
    }),
    selectFailureAction: () => {
      throw new Error('manual stop must bypass failure action selection');
    },
    setState: async (patch) => { appState = { ...appState, ...patch }; },
    sleepWithStop: async () => {},
    throwIfAutoRunSessionStopped: () => {},
    waitForRunningNodesToFinish: async () => appState,
    chrome: { runtime: { sendMessage: async () => {} } },
  });

  await runner.autoRunLoop(2);

  assert.equal(runtimeState.autoRunActive, false);
  assert.equal(runtimeState.autoRunCurrentRun, 2);
  assert.equal(replayCalls, 0);
});

test('fresh auto-run preserves the no-2FA route and reapplies its skipped password nodes after reset', async () => {
  let runtimeState = {
    autoRunActive: false,
    autoRunCurrentRun: 0,
    autoRunTotalRuns: 0,
    autoRunAttemptRun: 0,
    autoRunSessionId: 0,
  };
  let appState = {
    registrationFreeRoute: 'no-2fa-free',
    autoRunFallbackThreadIntervalMinutes: 0,
    nodeStatuses: {
      'fetch-gpt-password-code': 'skipped',
      'set-gpt-password': 'skipped',
      'persist-no-2fa-free': 'pending',
    },
  };
  let executionState = null;
  const resetMessages = [];
  const summaryBuilder = createAutoRunSummaryBuilder({ addLog: async () => {} });
  const runner = createAutoRunSessionRunner({
    ...summaryBuilder,
    addLog: async () => {},
    appendAccountRunRecord: async () => ({}),
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 0,
    AUTO_RUN_RETRY_DELAY_MS: 1,
    AUTO_RUN_TIMER_KIND_BEFORE_RETRY: 'before_retry',
    AUTO_RUN_TIMER_KIND_BETWEEN_ROUNDS: 'between_rounds',
    broadcastAutoRunStatus: async () => {},
    broadcastStopToContentScripts: async () => {},
    cancelPendingCommands: () => {},
    clearStopRequest: () => {},
    createAutoRunRoundLogSnapshotMarker: () => ({}),
    createAutoRunSessionId: () => 902,
    ensureHotmailMailboxReadyForAutoRunRound: null,
    evaluateAttemptFailure: () => ({ reason: 'unexpected failure' }),
    getAutoRunRoundSnapshotReason: () => '',
    getAutoRunRoundSnapshotStatus: () => 'success',
    getAutoRunStatusPayload: (phase, payload) => ({
      autoRunPhase: phase,
      autoRunCurrentRun: payload.currentRun,
      autoRunTotalRuns: payload.totalRuns,
      autoRunAttemptRun: payload.attemptRun,
      autoRunSessionId: payload.sessionId,
    }),
    getDefaultNodeStatusesForState: (state) => state.registrationFreeRoute === 'no-2fa-free'
      ? {
        'fetch-gpt-password-code': 'skipped',
        'set-gpt-password': 'skipped',
        'persist-no-2fa-free': 'pending',
      }
      : {
        'fetch-gpt-password-code': 'pending',
        'set-gpt-password': 'pending',
        'enable-totp-mfa': 'pending',
      },
    getErrorMessage: (error) => error?.message || String(error || ''),
    getFirstUnfinishedNodeId: () => null,
    getMaxAttemptsForRound: () => 1,
    getPendingAutoRunTimerPlan: () => null,
    getRunningNodeIds: () => [],
    getState: async () => appState,
    getStopRequested: () => false,
    hasSavedNodeProgress: () => false,
    isStopError: () => false,
    launchAutoRunTimerPlan: async () => false,
    logAutoRunFinalSummary: async () => {},
    normalizeAutoRunFallbackThreadIntervalMinutes: () => 0,
    persistAutoRunTimerPlan: async () => {},
    replayPreviousSuccessfulAutoRunRoundLogSnapshot: async () => {},
    resetState: async () => {
      appState = {
        registrationFreeRoute: 'full-2fa',
        autoRunFallbackThreadIntervalMinutes: 0,
        nodeStatuses: {
          'fetch-gpt-password-code': 'pending',
          'set-gpt-password': 'pending',
          'enable-totp-mfa': 'pending',
        },
      };
    },
    resolveAutoRunAccountRecordStatus: (status) => status,
    runAutoSequenceFromNode: async () => {
      executionState = structuredClone(appState);
    },
    runtime: {
      get: () => runtimeState,
      set: (patch) => { runtimeState = { ...runtimeState, ...patch }; },
    },
    saveAutoRunRoundLogSnapshot: async () => null,
    selectFailureAction: () => ({ code: 'fail_generic' }),
    setState: async (patch) => { appState = { ...appState, ...patch }; },
    sleepWithStop: async () => {},
    throwIfAutoRunSessionStopped: () => {},
    waitForRunningNodesToFinish: async () => appState,
    chrome: { runtime: { sendMessage: async (message) => { resetMessages.push(message); } } },
  });

  await runner.autoRunLoop(1);

  assert.equal(executionState.registrationFreeRoute, 'no-2fa-free');
  assert.equal(executionState.nodeStatuses['fetch-gpt-password-code'], 'skipped');
  assert.equal(executionState.nodeStatuses['set-gpt-password'], 'skipped');
  assert.equal(executionState.nodeStatuses['security-factor-not-required'], undefined);
  assert.equal(executionState.nodeStatuses['persist-no-2fa-free'], 'pending');
  assert.deepEqual(resetMessages.find((message) => message.type === 'AUTO_RUN_RESET')?.payload, {
    registrationFreeRoute: 'no-2fa-free',
    currentNodeId: '',
    nodeStatuses: executionState.nodeStatuses,
  });
});
