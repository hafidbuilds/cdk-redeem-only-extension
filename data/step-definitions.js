(function attachStepDefinitions(root, factory) {
  root.MultiPageStepDefinitions = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createStepDefinitionsModule() {
  const DEFAULT_ACTIVE_FLOW_ID = 'openai';
  const PLUS_PAYMENT_METHOD_UPI = 'upi';
  const PLUS_ACCOUNT_ACCESS_STRATEGY_OAUTH = 'oauth';
  const SIGNUP_METHOD_EMAIL = 'email';
  const REGISTRATION_FREE_ROUTE_FULL_2FA = 'full-2fa';
  const REGISTRATION_FREE_ROUTE_NO_2FA = 'no-2fa-free';
  const REGISTRATION_FREE_ROUTE_PASSKEY = 'passkey-free';
  const WORKFLOW_VERSION = 3;

  const COMMON_REGISTRATION_STEP_DEFINITIONS = Object.freeze([
    { id: 1, order: 10, key: 'open-chatgpt', title: '打开 ChatGPT 官网', sourceId: 'chatgpt', driverId: null, command: 'open-chatgpt' },
    { id: 2, order: 20, key: 'submit-signup-email', title: '注册并输入邮箱', sourceId: 'openai-auth', driverId: 'content/signup-page', command: 'submit-signup-email' },
    { id: 3, order: 30, key: 'fill-password', title: '填写密码并继续', sourceId: 'openai-auth', driverId: 'content/signup-page', command: 'fill-password' },
    {
      id: 4,
      order: 40,
      key: 'existing-totp-login',
      title: '已有账号 2FA 登录',
      sourceId: 'openai-auth',
      driverId: null,
      command: 'existing-totp-login',
      applicability: 'conditional',
    },
    { id: 5, order: 50, key: 'fetch-signup-code', title: '获取注册验证码', sourceId: 'openai-auth', driverId: 'content/signup-page', command: 'submit-verification-code', mailRuleId: 'openai-signup-code' },
    { id: 6, order: 60, key: 'fill-profile', title: '填写姓名和生日', sourceId: 'openai-auth', driverId: 'content/signup-page', command: 'fill-profile' },
  ]);

  const PASSWORD_SETUP_STEP_DEFINITIONS = Object.freeze([
    { id: 7, order: 70, key: 'fetch-gpt-password-code', title: '收取设置密码验证码', sourceId: 'openai-auth', driverId: null, command: 'fetch-gpt-password-code' },
    { id: 8, order: 80, key: 'set-gpt-password', title: '设置 GPT 密码', sourceId: 'openai-auth', driverId: null, command: 'set-gpt-password' },
  ]);

  const UPI_STEP_DEFINITIONS = Object.freeze([
    ...COMMON_REGISTRATION_STEP_DEFINITIONS,
    ...PASSWORD_SETUP_STEP_DEFINITIONS,
    { id: 9, order: 90, key: 'enable-totp-mfa', title: '设置或校验 2FA', sourceId: 'chatgpt', driverId: null, command: 'enable-totp-mfa' },
  ]);

  const NO_2FA_FREE_STEP_DEFINITIONS = Object.freeze([
    ...COMMON_REGISTRATION_STEP_DEFINITIONS,
    ...PASSWORD_SETUP_STEP_DEFINITIONS.map((step) => ({
      ...step,
      command: '',
      applicability: 'route-skipped',
      defaultStatus: 'skipped',
      ui: { disabled: true, statusText: '当前路线跳过' },
    })),
    { id: 9, order: 90, key: 'persist-no-2fa-free', title: '保存 Free 账号', sourceId: 'chatgpt', driverId: null, command: 'persist-no-2fa-free' },
  ]);

  const PASSKEY_FREE_STEP_DEFINITIONS = Object.freeze([
    ...COMMON_REGISTRATION_STEP_DEFINITIONS,
    ...PASSWORD_SETUP_STEP_DEFINITIONS,
    { id: 9, order: 90, key: 'enable-passkey', title: '设置 Passkey', sourceId: 'chatgpt', driverId: null, command: 'enable-passkey' },
  ]);

  function normalizeActiveFlowId(value = '', fallback = DEFAULT_ACTIVE_FLOW_ID) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized) {
      return normalized;
    }
    const fallbackValue = String(fallback || '').trim().toLowerCase();
    return fallbackValue || DEFAULT_ACTIVE_FLOW_ID;
  }

  function normalizePlusPaymentMethod() {
    return PLUS_PAYMENT_METHOD_UPI;
  }

  function normalizeSignupMethod() {
    return SIGNUP_METHOD_EMAIL;
  }

  function normalizePlusAccountAccessStrategy() {
    return PLUS_ACCOUNT_ACCESS_STRATEGY_OAUTH;
  }

  function normalizeRegistrationFreeRoute(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === REGISTRATION_FREE_ROUTE_NO_2FA) {
      return REGISTRATION_FREE_ROUTE_NO_2FA;
    }
    if (normalized === REGISTRATION_FREE_ROUTE_PASSKEY) {
      return REGISTRATION_FREE_ROUTE_PASSKEY;
    }
    return REGISTRATION_FREE_ROUTE_FULL_2FA;
  }

  function isPlusModeEnabled() {
    return true;
  }

  function cloneSteps(steps = [], options = {}, flowId = DEFAULT_ACTIVE_FLOW_ID) {
    return steps.map((step) => ({ ...step, flowId }));
  }

  function cloneNodes(steps = [], options = {}, flowId = DEFAULT_ACTIVE_FLOW_ID) {
    return steps.map((step, index) => {
      const nodeId = String(step.key || '').trim();
      return {
        legacyStepId: Number(step.id),
        nodeId,
        flowId,
        title: step.title,
        displayOrder: Number.isFinite(Number(step.order)) ? Number(step.order) : Number(step.id),
        nodeType: 'task',
        sourceId: step.sourceId || '',
        driverId: step.driverId || '',
        executeKey: String(step.executeKey ?? step.command ?? step.key ?? '').trim(),
        command: String(step.command ?? step.key ?? '').trim(),
        mailRuleId: String(step.mailRuleId || '').trim(),
        applicability: String(step.applicability || 'required').trim(),
        defaultStatus: String(step.defaultStatus || 'pending').trim(),
        next: steps[index + 1]?.key ? [String(steps[index + 1].key)] : [],
        retryPolicy: {},
        recoveryPolicy: {},
        ui: step.ui && typeof step.ui === 'object' ? { ...step.ui } : {},
      };
    }).filter((node) => Boolean(node.nodeId));
  }

  function getSteps(options = {}) {
    const flowId = normalizeActiveFlowId(options?.activeFlowId, DEFAULT_ACTIVE_FLOW_ID);
    const route = normalizeRegistrationFreeRoute(options?.registrationFreeRoute);
    const steps = route === REGISTRATION_FREE_ROUTE_NO_2FA
      ? NO_2FA_FREE_STEP_DEFINITIONS
      : (route === REGISTRATION_FREE_ROUTE_PASSKEY ? PASSKEY_FREE_STEP_DEFINITIONS : UPI_STEP_DEFINITIONS);
    return cloneSteps(steps, options, flowId);
  }

  function getNodes(options = {}) {
    const flowId = normalizeActiveFlowId(options?.activeFlowId, DEFAULT_ACTIVE_FLOW_ID);
    const route = normalizeRegistrationFreeRoute(options?.registrationFreeRoute);
    const steps = route === REGISTRATION_FREE_ROUTE_NO_2FA
      ? NO_2FA_FREE_STEP_DEFINITIONS
      : (route === REGISTRATION_FREE_ROUTE_PASSKEY ? PASSKEY_FREE_STEP_DEFINITIONS : UPI_STEP_DEFINITIONS);
    return cloneNodes(steps, options, flowId);
  }

  function getAllSteps(options = {}) {
    const flowId = normalizeActiveFlowId(options?.activeFlowId, DEFAULT_ACTIVE_FLOW_ID);
    const byKey = new Map();
    for (const step of [...UPI_STEP_DEFINITIONS, ...PASSKEY_FREE_STEP_DEFINITIONS, ...NO_2FA_FREE_STEP_DEFINITIONS]) {
      const key = String(step?.key || '').trim();
      if (key && !byKey.has(key)) {
        byKey.set(key, { ...step, flowId });
      }
    }
    return [...byKey.values()];
  }

  function getAllNodes(options = {}) {
    return cloneNodes(getAllSteps(options), options, normalizeActiveFlowId(options?.activeFlowId, DEFAULT_ACTIVE_FLOW_ID));
  }

  function getDefaultNodeStatuses(options = {}) {
    return Object.fromEntries(getNodes(options).map((node) => [node.nodeId, node.defaultStatus || 'pending']));
  }

  function normalizeStoredNodeStatus(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'running') return 'pending';
    return ['pending', 'completed', 'manual_completed', 'skipped', 'failed', 'stopped'].includes(normalized)
      ? normalized
      : 'pending';
  }

  function isDoneStatus(status = '') {
    return ['completed', 'manual_completed', 'skipped'].includes(normalizeStoredNodeStatus(status));
  }

  function migrateWorkflowState(state = {}) {
    const route = normalizeRegistrationFreeRoute(state?.registrationFreeRoute);
    const defaults = getDefaultNodeStatuses({
      ...state,
      registrationFreeRoute: route,
    });
    const oldStatuses = state?.nodeStatuses && typeof state.nodeStatuses === 'object'
      ? state.nodeStatuses
      : {};
    const nextStatuses = { ...defaults };
    const copyStatus = (nodeId) => {
      if (Object.prototype.hasOwnProperty.call(oldStatuses, nodeId) && Object.prototype.hasOwnProperty.call(nextStatuses, nodeId)) {
        nextStatuses[nodeId] = normalizeStoredNodeStatus(oldStatuses[nodeId]);
      }
    };

    for (const nodeId of ['open-chatgpt', 'submit-signup-email', 'fill-password', 'fetch-signup-code', 'fill-profile']) {
      copyStatus(nodeId);
    }

    const oldExistingTotpStatus = normalizeStoredNodeStatus(state?.existingTotpLoginDisplayStatus);
    const downstreamRegistrationDone = ['fetch-signup-code', 'fill-profile', 'set-gpt-password', 'enable-totp-mfa', 'enable-passkey', 'persist-no-2fa-free', 'check-trial-eligibility']
      .some((nodeId) => isDoneStatus(oldStatuses[nodeId]));
    if (state?.existingTotpLogin === true || oldExistingTotpStatus === 'completed' || oldExistingTotpStatus === 'manual_completed') {
      nextStatuses['existing-totp-login'] = oldExistingTotpStatus === 'manual_completed' ? 'manual_completed' : 'completed';
    } else if (['failed', 'stopped'].includes(oldExistingTotpStatus)) {
      nextStatuses['existing-totp-login'] = oldExistingTotpStatus;
    } else if (downstreamRegistrationDone) {
      nextStatuses['existing-totp-login'] = 'skipped';
    }

    const oldSetPasswordStatus = normalizeStoredNodeStatus(oldStatuses['set-gpt-password']);
    if (route !== REGISTRATION_FREE_ROUTE_NO_2FA && isDoneStatus(oldSetPasswordStatus)) {
      nextStatuses['fetch-gpt-password-code'] = oldSetPasswordStatus;
      nextStatuses['set-gpt-password'] = oldSetPasswordStatus;
    } else if (route !== REGISTRATION_FREE_ROUTE_NO_2FA) {
      nextStatuses['fetch-gpt-password-code'] = 'pending';
      nextStatuses['set-gpt-password'] = 'pending';
    }

    if (state?.existingTotpLogin === true && isDoneStatus(nextStatuses['existing-totp-login'])) {
      for (const nodeId of ['fetch-signup-code', 'fill-profile', 'fetch-gpt-password-code', 'set-gpt-password']) {
        if (Object.prototype.hasOwnProperty.call(nextStatuses, nodeId)) {
          nextStatuses[nodeId] = 'skipped';
        }
      }
    }

    if (route === REGISTRATION_FREE_ROUTE_NO_2FA) {
      nextStatuses['fetch-gpt-password-code'] = 'skipped';
      nextStatuses['set-gpt-password'] = 'skipped';
      const oldPersistStatus = normalizeStoredNodeStatus(oldStatuses['persist-no-2fa-free']);
      const eligibilityStatus = String(state?.trialEligibilityStatus || '').trim().toLowerCase();
      nextStatuses['persist-no-2fa-free'] = isDoneStatus(oldPersistStatus)
        ? oldPersistStatus
        : (['eligible', 'ineligible'].includes(eligibilityStatus) ? 'completed' : oldPersistStatus);
    } else {
      const factorNodeId = route === REGISTRATION_FREE_ROUTE_PASSKEY ? 'enable-passkey' : 'enable-totp-mfa';
      const oldFactorStatus = normalizeStoredNodeStatus(oldStatuses[factorNodeId]);
      const factorPersisted = route === REGISTRATION_FREE_ROUTE_PASSKEY
        ? state?.passkeyEnabled === true
        : state?.totpMfaEnabled === true || Boolean(state?.totpMfaSecret);
      if (isDoneStatus(oldFactorStatus)) {
        nextStatuses[factorNodeId] = oldFactorStatus;
      } else if (factorPersisted) {
        nextStatuses[factorNodeId] = 'completed';
      } else if (isDoneStatus(oldStatuses['check-trial-eligibility'])) {
        nextStatuses[factorNodeId] = 'completed';
      } else {
        nextStatuses[factorNodeId] = oldFactorStatus;
      }
    }

    const activeNodeIds = Object.keys(nextStatuses);
    const rawLegacyCurrentNodeId = String(state?.currentNodeId || '').trim();
    const legacyCurrentNodeId = route === REGISTRATION_FREE_ROUTE_NO_2FA
      && rawLegacyCurrentNodeId === 'security-factor-not-required'
      ? 'persist-no-2fa-free'
      : rawLegacyCurrentNodeId;
    const passwordSplitMustRestart = route !== REGISTRATION_FREE_ROUTE_NO_2FA
      && legacyCurrentNodeId === 'set-gpt-password'
      && !isDoneStatus(oldSetPasswordStatus);
    const currentNodeId = passwordSplitMustRestart
      ? 'fetch-gpt-password-code'
      : (activeNodeIds.includes(legacyCurrentNodeId) && !isDoneStatus(nextStatuses[legacyCurrentNodeId])
        ? legacyCurrentNodeId
        : (activeNodeIds.find((nodeId) => !isDoneStatus(nextStatuses[nodeId])) || ''));
    return {
      workflowVersion: WORKFLOW_VERSION,
      currentNodeId,
      nodeStatuses: nextStatuses,
    };
  }

  function getStepIds(options = {}) {
    return getSteps(options).map((step) => Number(step.id)).filter(Number.isFinite);
  }

  function getNodeIds(options = {}) {
    return getNodes(options).map((node) => node.nodeId);
  }

  function getLastStepId(options = {}) {
    const ids = getStepIds(options);
    return ids[ids.length - 1] || 0;
  }

  function getStepById(id, options = {}) {
    const numericId = Number(id);
    return getSteps(options).find((step) => Number(step.id) === numericId) || null;
  }

  function getNodeById(nodeId, options = {}) {
    const normalizedNodeId = String(nodeId || '').trim();
    return getNodes(options).find((node) => node.nodeId === normalizedNodeId) || null;
  }

  function getNodeByDisplayOrder(displayOrder, options = {}) {
    const normalizedOrder = Number(displayOrder);
    return getNodes(options).find((node) => Number(node.displayOrder) === normalizedOrder) || null;
  }

  function getWorkflow(options = {}) {
    const flowId = normalizeActiveFlowId(options?.activeFlowId || options?.flowId, DEFAULT_ACTIVE_FLOW_ID);
    const nodes = getNodes({ ...options, activeFlowId: flowId, flowId });
    return {
      flowId,
      workflowVersion: WORKFLOW_VERSION,
      nodes,
      nodeIds: nodes.map((node) => node.nodeId),
    };
  }

  function getPlusPaymentStepTitle() {
    return 'GCash 资格检测';
  }

  function getRegisteredFlowIds() {
    return [DEFAULT_ACTIVE_FLOW_ID];
  }

  function hasFlow(flowId) {
    return normalizeActiveFlowId(flowId, '') === DEFAULT_ACTIVE_FLOW_ID;
  }

  return {
    DEFAULT_ACTIVE_FLOW_ID,
    STEP_DEFINITIONS: UPI_STEP_DEFINITIONS,
    NORMAL_STEP_DEFINITIONS: UPI_STEP_DEFINITIONS,
    PLUS_STEP_DEFINITIONS: UPI_STEP_DEFINITIONS,
    PLUS_PAYMENT_METHOD_UPI,
    PLUS_ACCOUNT_ACCESS_STRATEGY_OAUTH,
    PLUS_UPI_STEP_DEFINITIONS: UPI_STEP_DEFINITIONS,
    REGISTRATION_FREE_ROUTE_FULL_2FA,
    REGISTRATION_FREE_ROUTE_NO_2FA,
    REGISTRATION_FREE_ROUTE_PASSKEY,
    SIGNUP_METHOD_EMAIL,
    WORKFLOW_VERSION,
    getAllSteps,
    getAllNodes,
    getDefaultNodeStatuses,
    migrateWorkflowState,
    getLastStepId,
    getNodeByDisplayOrder,
    getNodeById,
    getNodeIds,
    getNodes,
    getPlusPaymentStepTitle,
    getRegisteredFlowIds,
    getStepById,
    getStepIds,
    getSteps,
    getWorkflow,
    hasFlow,
    isPlusModeEnabled,
    normalizePlusAccountAccessStrategy,
    normalizeActiveFlowId,
    normalizePlusPaymentMethod,
    normalizeRegistrationFreeRoute,
    normalizeSignupMethod,
  };
});
