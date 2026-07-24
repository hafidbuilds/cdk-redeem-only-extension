(function attachBackgroundSettingsNormalizers(globalScope) {
  function normalizeBoundedIntegerSetting(value, fallback, min, max) {
    const rawValue = String(value ?? '').trim();
    const numeric = Number(rawValue);
    const fallbackNumeric = Number(fallback);
    const normalizedFallback = Number.isFinite(fallbackNumeric)
      ? Math.min(max, Math.max(min, Math.floor(fallbackNumeric)))
      : min;
    if (!rawValue || !Number.isFinite(numeric)) {
      return normalizedFallback;
    }
    return Math.min(max, Math.max(min, Math.floor(numeric)));
  }

  function normalizeLocalHttpBaseUrl(value = '', fallback = 'http://127.0.0.1:18767') {
    const rawValue = String(value || fallback).trim();
    try {
      const parsed = new URL(rawValue);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return fallback;
      }
      const endpointPath = parsed.pathname.replace(/\/+$/g, '') || '/';
      if (['/otp', '/latest-otp', '/health'].includes(endpointPath)) {
        parsed.pathname = '';
        parsed.search = '';
        parsed.hash = '';
      }
      return parsed.toString().replace(/\/$/, '');
    } catch {
      return fallback;
    }
  }

  function normalizeUrl(value = '', fallback = '') {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
      return fallback;
    }
    try {
      return new URL(trimmed).toString();
    } catch {
      return fallback;
    }
  }

  function normalizeSignupMethod() {
    return 'email';
  }

  function createSettingsNormalizers(config = {}) {
    const {
      autoRunDelayMaxMinutes = 1440,
      autoRunDelayMinMinutes = 0,
      autoStepDelayMaxSeconds = 600,
      autoStepDelayMinSeconds = 0,
      persistedSettingDefaults = {},
      verificationResendCountMax = 20,
      verificationResendCountMin = 0,
    } = config;

    function normalizeAutoRunDelayMinutes(value) {
      return normalizeBoundedIntegerSetting(
        value,
        persistedSettingDefaults.autoRunDelayMinutes,
        autoRunDelayMinMinutes,
        autoRunDelayMaxMinutes
      );
    }

    function normalizeAutoRunFallbackThreadIntervalMinutes(value) {
      const rawValue = String(value ?? '').trim();
      if (!rawValue) {
        return 0;
      }
      return normalizeBoundedIntegerSetting(value, 0, 0, autoRunDelayMaxMinutes);
    }

    function normalizeAutoStepDelaySeconds(value, fallback = null) {
      const rawValue = String(value ?? '').trim();
      if (!rawValue) {
        return fallback;
      }
      return normalizeBoundedIntegerSetting(value, fallback, autoStepDelayMinSeconds, autoStepDelayMaxSeconds);
    }

    function normalizeVerificationResendCount(value, fallback) {
      const rawValue = String(value ?? '').trim();
      if (!rawValue) {
        return fallback;
      }
      return normalizeBoundedIntegerSetting(value, fallback, verificationResendCountMin, verificationResendCountMax);
    }

    return {
      normalizeAutoRunDelayMinutes,
      normalizeAutoRunFallbackThreadIntervalMinutes,
      normalizeAutoStepDelaySeconds,
      normalizeBoundedIntegerSetting,
      normalizeLocalHttpBaseUrl,
      normalizeSignupMethod,
      normalizeUrl,
      normalizeVerificationResendCount,
    };
  }

  globalScope.MultiPageBackgroundSettingsNormalizers = {
    createSettingsNormalizers,
    normalizeBoundedIntegerSetting,
    normalizeLocalHttpBaseUrl,
    normalizeSignupMethod,
    normalizeUrl,
  };
})(self);
