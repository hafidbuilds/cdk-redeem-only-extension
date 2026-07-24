(function attachMultiPageUpiRedeemSubmissionResponse(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.MultiPageUpiRedeemSubmissionResponse = api;
})(typeof self !== 'undefined' ? self : globalThis, function createMultiPageUpiRedeemSubmissionResponseModule() {
  function createUpiRedeemSubmissionResponse(context = {}) {
    const normalizeString = (...args) => context.normalizeString(...args);

    async function readResponseBody(response) {
      if (!response) {
        return null;
      }
      if (typeof response.text === 'function') {
        const text = await response.text();
        if (!normalizeString(text)) {
          return null;
        }
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      }
      if (typeof response.json === 'function') {
        return response.json().catch(() => null);
      }
      return null;
    }

    function getPayloadError(payload) {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return '';
      }
      if (payload.ok === false || payload.success === false) {
        return normalizeString(payload.error || payload.message || 'UPI 兑换接口返回失败。');
      }
      if (payload.error) {
        return typeof payload.error === 'string'
          ? normalizeString(payload.error)
          : JSON.stringify(payload.error);
      }
      if (Array.isArray(payload.errors) && payload.errors.length) {
        return JSON.stringify(payload.errors);
      }
      const status = normalizeString(payload.status).toLowerCase();
      if (['error', 'failed', 'failure'].includes(status)) {
        return normalizeString(payload.message || payload.status);
      }
      return '';
    }

    function getPayloadErrorDetails(payload) {
      const payloadError = getPayloadError(payload);
      if (payloadError) {
        return payloadError;
      }
      if (typeof payload === 'string') {
        return normalizeString(payload).replace(/\s+/g, ' ').slice(0, 500);
      }
      if (payload && typeof payload === 'object') {
        try {
          return JSON.stringify(payload).slice(0, 500);
        } catch {
          return '';
        }
      }
      return '';
    }

    function isUpiAccessTokenExpiredPayload(payload = {}, statusCode = 0) {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return false;
      }
      const code = normalizeString(payload.code || payload.error_code || payload.errorCode);
      const message = normalizeString(payload.message || payload.error || payload.reason);
      return (Number(statusCode) === 401 && code === '10002')
        || /未登录|会话已过期|重新登录|session\s*expired|not\s*logged\s*in|login\s*required|unauthenticated/i.test(message)
        || /(?:access[\s_-]?token|token|session)[\s:_-]*(?:401|unauthorized|invalid|expired|失效|过期|无效)/i.test(message)
        || /(?:401|unauthorized|invalid|expired|失效|过期|无效)[\s\S]*(?:access[\s_-]?token|token|session)/i.test(message);
    }

    function getResponseContentType(response) {
      try {
        return normalizeString(response?.headers?.get?.('content-type')).toLowerCase();
      } catch {
        return '';
      }
    }

    function isHtmlResponsePayload(response, payload) {
      const contentType = getResponseContentType(response);
      if (contentType.includes('text/html')) {
        return true;
      }
      if (typeof payload !== 'string') {
        return false;
      }
      return /^\s*(?:<!doctype\s+html\b|<html[\s>]|<head[\s>]|<body[\s>])/i.test(payload);
    }

    return {
      readResponseBody,
      getPayloadError,
      getPayloadErrorDetails,
      isUpiAccessTokenExpiredPayload,
      getResponseContentType,
      isHtmlResponsePayload,
    };
  }

  return { createUpiRedeemSubmissionResponse };
});
