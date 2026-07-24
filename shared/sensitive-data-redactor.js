(function attachSensitiveDataRedactor(root, factory) {
  const api = factory();
  root.MultiPageSensitiveDataRedactor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createSensitiveDataRedactorModule() {
  const SENSITIVE_KEY = /password|passphrase|authorization|access.?token|refresh.?token|cookie|totp|2fa|api.?key|secret|private.?jwk|proxy.?password|cdkey|cdk|mail.?body|message.?body|raw.?mail/i;

  function mask(value = '') {
    const text = String(value ?? '');
    if (!text) return '';
    if (text.length <= 4) return '[REDACTED]';
    return `${text.slice(0, 2)}...[REDACTED]`;
  }

  function redactText(value = '') {
    const input = String(value ?? '');
    if (/^cdkey:(upi|ideal|pix):fnv1a_[0-9a-f]{8}$/i.test(input)) return input;
    return input
      .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, 'Bearer [REDACTED]')
      .replace(/\b(?:sk|key|token)-[A-Za-z0-9_-]{8,}\b/gi, '[REDACTED]')
      .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[JWT_REDACTED]')
      .replace(/\b(password|passphrase|access_?token|refresh_?token|api_?key|cookie|totp|2fa[_ -]?secret|cdk(?:ey)?)\s*[:=]\s*([^\s,;]+)/gi, '$1=[REDACTED]');
  }

  function redactSensitiveData(value, seen = new WeakSet()) {
    if (typeof value === 'string') return redactText(value);
    if (value === null || value === undefined || typeof value !== 'object') return value;
    if (seen.has(value)) return '[CIRCULAR]';
    seen.add(value);
    if (Array.isArray(value)) return value.map((item) => redactSensitiveData(item, seen));
    const output = {};
    Object.entries(value).forEach(([key, item]) => {
      output[key] = SENSITIVE_KEY.test(key) ? mask(item) : redactSensitiveData(item, seen);
    });
    return output;
  }

  return { SENSITIVE_KEY, mask, redactSensitiveData, redactText };
});
