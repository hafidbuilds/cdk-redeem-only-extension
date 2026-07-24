(function attachMultiPageVerificationMailBaseline(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MultiPageVerificationMailBaseline = api;
})(typeof self !== 'undefined' ? self : globalThis, function createVerificationMailBaselineModule() {
  function normalizeText(value = '') {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeEmail(value = '') {
    return normalizeText(value).toLowerCase();
  }

  function hashText(value = '') {
    let hash = 2166136261;
    const input = String(value);
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  function getMessageId(message = {}) {
    return normalizeText(
      message.id
      || message.messageId
      || message.message_id
      || message.internetMessageId
      || message.internet_message_id
    );
  }

  function getMessageTimestamp(message = {}) {
    const raw = message.receivedAt
      || message.receivedDateTime
      || message.received_at
      || message.timestamp
      || message.created_at
      || message.date
      || message.time;
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) return numeric < 1e12 ? numeric * 1000 : numeric;
    const parsed = Date.parse(String(raw || ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getMessageFingerprint(message = {}) {
    if (message.fingerprint) return normalizeText(message.fingerprint);
    const id = getMessageId(message);
    if (id) return `message:${hashText(id)}`;
    const sender = message.from?.emailAddress?.address || message.from || message.sender || message.sender_email || '';
    const subject = message.subject || message.title || '';
    const timestamp = getMessageTimestamp(message);
    const preview = message.bodyPreview || message.preview || message.snippet || message.text || '';
    return `mail:${hashText([normalizeEmail(sender), normalizeText(subject).toLowerCase(), timestamp, normalizeText(preview).slice(0, 240)].join('|'))}`;
  }

  function normalizeBaseline(value = {}, fallback = {}) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      version: 1,
      step: Number(source.step || fallback.step) || 0,
      targetEmail: normalizeEmail(source.targetEmail || fallback.targetEmail),
      provider: normalizeText(source.provider || fallback.provider).toLowerCase(),
      sessionKey: normalizeText(source.sessionKey || fallback.sessionKey),
      requestedAt: Math.max(0, Number(source.requestedAt || fallback.requestedAt) || 0),
      knownMessageIds: Array.from(new Set((source.knownMessageIds || fallback.knownMessageIds || []).map((item) => typeof item === 'string' ? normalizeText(item) : getMessageId(item)).filter(Boolean))).slice(-100),
      knownFingerprints: Array.from(new Set((source.knownFingerprints || fallback.knownFingerprints || []).map((item) => normalizeText(item)).filter(Boolean))).slice(-100),
      consumedMessageIds: Array.from(new Set((source.consumedMessageIds || []).map(normalizeText).filter(Boolean))).slice(-100),
      consumedFingerprints: Array.from(new Set((source.consumedFingerprints || []).map(normalizeText).filter(Boolean))).slice(-100),
    };
  }

  function createBaseline(options = {}) {
    return normalizeBaseline({
      ...options,
      requestedAt: options.requestedAt || Date.now(),
    });
  }

  function isMessageFresh(message, baseline = {}, options = {}) {
    const normalized = normalizeBaseline(baseline);
    const id = getMessageId(message);
    const fingerprint = getMessageFingerprint(message);
    if (id && (normalized.knownMessageIds.includes(id) || normalized.consumedMessageIds.includes(id))) return false;
    if (normalized.knownFingerprints.includes(fingerprint) || normalized.consumedFingerprints.includes(fingerprint)) return false;
    const timestamp = getMessageTimestamp(message);
    const requestedAt = Number(options.requestedAt || normalized.requestedAt) || 0;
    return !requestedAt || !timestamp || timestamp >= requestedAt;
  }

  function markConsumed(baseline = {}, message = {}) {
    const normalized = normalizeBaseline(baseline);
    const id = getMessageId(message);
    const fingerprint = getMessageFingerprint(message);
    if (id) normalized.consumedMessageIds = [...normalized.consumedMessageIds.filter((item) => item !== id), id].slice(-100);
    if (fingerprint) normalized.consumedFingerprints = [...normalized.consumedFingerprints.filter((item) => item !== fingerprint), fingerprint].slice(-100);
    return normalized;
  }

  function createRequestBaseline(step, state = {}, requestedAt = Date.now()) {
    return createBaseline({
      step,
      provider: state.mailProvider,
      targetEmail: state.step8VerificationTargetEmail || state.email,
      sessionKey: state.activeFlowId || state.autoRunSessionId,
      requestedAt,
      knownMessageIds: state.verificationMailBaseline?.knownMessageIds || [],
      knownFingerprints: state.verificationMailBaseline?.knownFingerprints || [],
    });
  }

  function resolveBaseline(step, state = {}, mail = null, requestedAt = 0) {
    return normalizeBaseline(state.verificationMailBaseline, {
      step,
      provider: mail?.provider || state.mailProvider,
      targetEmail: state.step8VerificationTargetEmail || state.email,
      sessionKey: state.activeFlowId || state.autoRunSessionId,
      requestedAt,
    });
  }

  function redactMessageForLog(message = {}) {
    return {
      messageId: getMessageId(message) ? hashText(getMessageId(message)) : '',
      fingerprint: getMessageFingerprint(message),
      timestamp: getMessageTimestamp(message) || 0,
      sender: normalizeEmail(message.from?.emailAddress?.address || message.from || message.sender || ''),
      subject: normalizeText(message.subject || message.title || '').slice(0, 120),
    };
  }

  return {
    hashText,
    getMessageId,
    getMessageTimestamp,
    getMessageFingerprint,
    normalizeBaseline,
    createBaseline,
    createRequestBaseline,
    resolveBaseline,
    isMessageFresh,
    markConsumed,
    redactMessageForLog,
  };
});
