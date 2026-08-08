(function attachMembershipRoutes(root, factory) {
  const api = factory();
  root.MultiPageMembershipRoutes = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createMembershipRoutesModule() {
  function requireHandler(handler, name) {
    if (typeof handler !== 'function') {
      throw new Error(`Missing membership route handler: ${name}`);
    }
    return handler;
  }

  function createMembershipRoutes(deps = {}) {
    const {
      checkTrialEligibility,
      fillFreeAccessTokens,
      startFillSessions,
      resumeFillSessions,
      stopFillSessions,
    } = deps;

    return {
      CHECK_FREE_ACCOUNT_ELIGIBILITY: (payload, message, sender) => (
        requireHandler(checkTrialEligibility, 'checkTrialEligibility')(payload, message, sender)
      ),
      FILL_FREE_ACCOUNT_ACCESS_TOKENS: (payload, message, sender) => (
        requireHandler(fillFreeAccessTokens, 'fillFreeAccessTokens')(payload, message, sender)
      ),
      START_FILL_FREE_ACCOUNT_SESSIONS: (payload, message, sender) => (
        requireHandler(startFillSessions, 'startFillSessions')(payload, message, sender)
      ),
      RESUME_FREE_ACCOUNT_SESSION_FILL: (payload, message, sender) => (
        requireHandler(resumeFillSessions, 'resumeFillSessions')(payload, message, sender)
      ),
      STOP_FREE_ACCOUNT_SESSION_FILL: (payload, message, sender) => (
        requireHandler(stopFillSessions, 'stopFillSessions')(payload, message, sender)
      ),
    };
  }

  return {
    createMembershipRoutes,
  };
});
