(function attachEmailProviderRegistry(root, factory) {
  root.MultiPageEmailProviderRegistry = factory(root);
})(typeof self !== 'undefined' ? self : globalThis, function createEmailProviderRegistryModule(root) {
  const ICLOUD_PROVIDER = 'icloud';
  const ICLOUD_API_PROVIDER = 'icloud-api';
  const GMAIL_PROVIDER = 'gmail';
  const GMAIL_ALIAS_GENERATOR = 'gmail-alias';
  const HOTMAIL_PROVIDER = 'hotmail-api';
  const LUCKMAIL_PROVIDER = 'luckmail-api';
  const CLOUDFLARE_TEMP_EMAIL_PROVIDER = 'cloudflare-temp-email';
  const CLOUDFLARE_TEMP_EMAIL_GENERATOR = 'cloudflare-temp-email';
  const CLOUD_MAIL_PROVIDER = 'cloudmail';
  const CLOUD_MAIL_GENERATOR = 'cloudmail';
  const FREEMAIL_PROVIDER = 'freemail';
  const FREEMAIL_GENERATOR = 'freemail';
  const MOEMAIL_PROVIDER = 'moemail';
  const MOEMAIL_GENERATOR = 'moemail';
  const YYDSMAIL_PROVIDER = 'yydsmail';
  const YYDSMAIL_GENERATOR = 'yydsmail';
  const OUTLOOK_EMAIL_PLUS_PROVIDER = 'outlook-email-plus';
  const OUTLOOK_EMAIL_PLUS_GENERATOR = 'outlook-email-plus';
  const CUSTOM_EMAIL_POOL_GENERATOR = 'custom-pool';

  const PROVIDER_DEFINITIONS = Object.freeze([
    {
      id: LUCKMAIL_PROVIDER,
      displayName: 'LuckMail',
      fields: [
        { key: 'baseUrl', stateKey: 'luckmailBaseUrl', required: true, normalize: 'url', defaultValue: 'https://mails.luckyous.com' },
        { key: 'emailType', stateKey: 'luckmailEmailType', required: true, normalize: 'lower', defaultValue: 'ms_graph' },
        { key: 'apiKey', stateKey: 'luckmailApiKey', secret: true, required: true, normalize: 'trim' },
      ],
      capabilities: ['generate', 'poll', 'resend'],
      dedicatedUi: false,
    },
    {
      id: CLOUDFLARE_TEMP_EMAIL_PROVIDER,
      displayName: 'Cloudflare Temp Email',
      fields: [
        { key: 'baseUrl', stateKey: 'cloudflareTempEmailBaseUrl', required: true, normalize: 'url' },
        { key: 'adminAuth', stateKey: 'cloudflareTempEmailAdminAuth', secret: true, required: true, normalize: 'trim' },
        { key: 'customAuth', stateKey: 'cloudflareTempEmailCustomAuth', secret: true, normalize: 'trim' },
        { key: 'domain', stateKey: 'cloudflareTempEmailDomain', normalize: 'lower' },
      ],
      capabilities: ['generate', 'poll', 'resend'],
      dedicatedUi: false,
    },
    {
      id: CLOUD_MAIL_PROVIDER,
      displayName: 'Cloud Mail',
      fields: [
        { key: 'baseUrl', stateKey: 'cloudMailBaseUrl', required: true, normalize: 'url' },
        { key: 'adminEmail', stateKey: 'cloudMailAdminEmail', required: true, normalize: 'email' },
        { key: 'adminPassword', stateKey: 'cloudMailAdminPassword', secret: true, required: true, normalize: 'trim' },
        { key: 'token', stateKey: 'cloudMailToken', secret: true, normalize: 'trim' },
        { key: 'domain', stateKey: 'cloudMailDomain', normalize: 'lower' },
      ],
      capabilities: ['generate', 'poll', 'resend'],
      dedicatedUi: false,
    },
    {
      id: FREEMAIL_PROVIDER,
      displayName: 'freemail',
      fields: [
        { key: 'baseUrl', stateKey: 'freemailBaseUrl', required: true, normalize: 'url' },
        { key: 'adminUsername', stateKey: 'freemailAdminUsername', required: true, normalize: 'trim' },
        { key: 'adminPassword', stateKey: 'freemailAdminPassword', secret: true, required: true, normalize: 'trim' },
        { key: 'domain', stateKey: 'freemailDomain', normalize: 'lower' },
      ],
      capabilities: ['generate', 'poll', 'resend'],
      dedicatedUi: false,
    },
    {
      id: MOEMAIL_PROVIDER,
      displayName: 'MoeMail',
      fields: [
        { key: 'baseUrl', stateKey: 'moemailBaseUrl', required: true, normalize: 'url' },
        { key: 'apiKey', stateKey: 'moemailApiKey', secret: true, required: true, normalize: 'trim' },
        { key: 'domain', stateKey: 'moemailDomain', normalize: 'lower' },
      ],
      capabilities: ['generate', 'poll', 'resend'],
      dedicatedUi: false,
    },
    {
      id: YYDSMAIL_PROVIDER,
      displayName: 'YYDS Mail',
      fields: [
        { key: 'baseUrl', stateKey: 'yydsMailBaseUrl', required: true, normalize: 'url' },
        { key: 'apiKey', stateKey: 'yydsMailApiKey', secret: true, required: true, normalize: 'trim' },
        { key: 'domain', stateKey: 'yydsMailDomain', normalize: 'lower' },
      ],
      capabilities: ['generate', 'poll', 'resend'],
      dedicatedUi: false,
    },
    {
      id: OUTLOOK_EMAIL_PLUS_PROVIDER,
      displayName: 'Outlook Email Plus',
      fields: [
        { key: 'baseUrl', stateKey: 'outlookEmailPlusBaseUrl', required: true, normalize: 'url' },
        { key: 'apiKey', stateKey: 'outlookEmailPlusApiKey', secret: true, required: true, normalize: 'trim' },
        { key: 'provider', stateKey: 'outlookEmailPlusProvider', required: true, normalize: 'lower', defaultValue: 'outlook' },
        { key: 'projectKey', stateKey: 'outlookEmailPlusProjectKey', required: true, normalize: 'trim', defaultValue: 'openai' },
        { key: 'callerIdPrefix', stateKey: 'outlookEmailPlusCallerIdPrefix', normalize: 'trim', defaultValue: 'cdk-redeem' },
      ],
      capabilities: ['generate', 'poll', 'resend'],
      dedicatedUi: false,
    },
    {
      id: HOTMAIL_PROVIDER,
      displayName: 'Hotmail',
      fields: [],
      capabilities: ['poll', 'resend'],
      dedicatedUi: true,
    },
    { id: '2925', displayName: '2925 邮箱', fields: [], capabilities: ['poll'], dedicatedUi: true },
    { id: ICLOUD_PROVIDER, displayName: 'iCloud 邮箱', fields: [], capabilities: ['poll'], dedicatedUi: true },
    { id: ICLOUD_API_PROVIDER, displayName: 'iCloud API', fields: [], capabilities: ['poll'], dedicatedUi: true },
    { id: GMAIL_PROVIDER, displayName: 'Gmail', fields: [], capabilities: ['poll'], dedicatedUi: true },
    { id: 'custom', displayName: '自定义邮箱', fields: [], capabilities: ['poll'], dedicatedUi: true },
  ].map((definition) => Object.freeze({
    ...definition,
    fields: Object.freeze(definition.fields.map((field) => Object.freeze({ ...field }))),
    capabilities: Object.freeze(definition.capabilities.slice()),
  })));

  const EMAIL_PROVIDER_IDS = Object.freeze({
    ICLOUD_PROVIDER,
    ICLOUD_API_PROVIDER,
    GMAIL_PROVIDER,
    HOTMAIL_PROVIDER,
    LUCKMAIL_PROVIDER,
    CLOUDFLARE_TEMP_EMAIL_PROVIDER,
    CLOUD_MAIL_PROVIDER,
    FREEMAIL_PROVIDER,
    MOEMAIL_PROVIDER,
    YYDSMAIL_PROVIDER,
    OUTLOOK_EMAIL_PLUS_PROVIDER,
  });

  const EMAIL_GENERATOR_IDS = Object.freeze({
    GMAIL_ALIAS_GENERATOR,
    CLOUDFLARE_TEMP_EMAIL_GENERATOR,
    CLOUD_MAIL_GENERATOR,
    FREEMAIL_GENERATOR,
    MOEMAIL_GENERATOR,
    YYDSMAIL_GENERATOR,
    OUTLOOK_EMAIL_PLUS_GENERATOR,
    CUSTOM_EMAIL_POOL_GENERATOR,
  });

  function getProvider(stateOrProvider) {
    return typeof stateOrProvider === 'string'
      ? stateOrProvider
      : stateOrProvider?.mailProvider;
  }

  function defaultNormalizeMail2925Mode(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'receive' ? 'receive' : 'provide';
  }

  function create(context = {}) {
    const normalizeMail2925Mode = typeof context.normalizeMail2925Mode === 'function'
      ? context.normalizeMail2925Mode
      : defaultNormalizeMail2925Mode;
    const getMail2925Mode = typeof context.getMail2925Mode === 'function'
      ? context.getMail2925Mode
      : (stateOrMode) => {
        if (typeof stateOrMode === 'string') {
          return normalizeMail2925Mode(stateOrMode);
        }
        return normalizeMail2925Mode(stateOrMode?.mail2925Mode);
      };
    const getManagedAliasUtils = typeof context.getManagedAliasUtils === 'function'
      ? context.getManagedAliasUtils
      : () => root.MultiPageManagedAliasUtils || null;
    const isCustomMailProvider = typeof context.isCustomMailProvider === 'function'
      ? context.isCustomMailProvider
      : (stateOrProvider) => getProvider(stateOrProvider) === 'custom';
    const isHotmailProvider = typeof context.isHotmailProvider === 'function'
      ? context.isHotmailProvider
      : (stateOrProvider) => getProvider(stateOrProvider) === HOTMAIL_PROVIDER;
    const mail2925ModeProvide = String(
      context.MAIL_2925_MODE_PROVIDE
      || context.mail2925ModeProvide
      || 'provide'
    );

    function normalizeEmailGenerator(value = '') {
      const normalized = String(value || '').trim().toLowerCase();
      if (normalized === 'custom' || normalized === 'manual') {
        return 'custom';
      }
      if (normalized === GMAIL_ALIAS_GENERATOR) {
        return GMAIL_ALIAS_GENERATOR;
      }
      if (normalized === CUSTOM_EMAIL_POOL_GENERATOR) {
        return CUSTOM_EMAIL_POOL_GENERATOR;
      }
      if (normalized === 'icloud') {
        return 'icloud';
      }
      if (normalized === 'cloudflare') return 'cloudflare';
      if (normalized === CLOUDFLARE_TEMP_EMAIL_GENERATOR) return CLOUDFLARE_TEMP_EMAIL_GENERATOR;
      if (normalized === CLOUD_MAIL_GENERATOR) return CLOUD_MAIL_GENERATOR;
      if (normalized === FREEMAIL_GENERATOR) return FREEMAIL_GENERATOR;
      if (normalized === MOEMAIL_GENERATOR) return MOEMAIL_GENERATOR;
      if (normalized === YYDSMAIL_GENERATOR) return YYDSMAIL_GENERATOR;
      if (normalized === OUTLOOK_EMAIL_PLUS_GENERATOR) return OUTLOOK_EMAIL_PLUS_GENERATOR;
      return 'duck';
    }

    function isGeneratedAliasProvider(stateOrProvider, mail2925Mode = undefined) {
      if (
        stateOrProvider
        && typeof stateOrProvider === 'object'
        && !Array.isArray(stateOrProvider)
        && normalizeEmailGenerator(stateOrProvider.emailGenerator) === CUSTOM_EMAIL_POOL_GENERATOR
      ) {
        return false;
      }
      const provider = getProvider(stateOrProvider);
      const resolvedMail2925Mode = mail2925Mode !== undefined
        ? normalizeMail2925Mode(mail2925Mode)
        : getMail2925Mode(stateOrProvider);
      const utils = getManagedAliasUtils();
      if (utils?.usesManagedAliasGeneration) {
        return utils.usesManagedAliasGeneration(provider, { mail2925Mode: resolvedMail2925Mode });
      }
      if (utils?.isManagedAliasProvider) {
        if (String(provider || '').trim().toLowerCase() === '2925') {
          return utils.isManagedAliasProvider(provider) && resolvedMail2925Mode === mail2925ModeProvide;
        }
        return utils.isManagedAliasProvider(provider);
      }
      return provider === GMAIL_PROVIDER
        || (provider === '2925' && resolvedMail2925Mode === mail2925ModeProvide);
    }

    function shouldUseCustomRegistrationEmail(state = {}) {
      return isCustomMailProvider(state)
        || (!isHotmailProvider(state)
          && !isGeneratedAliasProvider(state)
          && normalizeEmailGenerator(state.emailGenerator) === 'custom');
    }

    function getProviderDefinition(providerOrState = '') {
      const provider = String(getProvider(providerOrState) || '').trim().toLowerCase();
      return PROVIDER_DEFINITIONS.find((definition) => definition.id === provider) || null;
    }

    function listProviderDefinitions() {
      return PROVIDER_DEFINITIONS.slice();
    }

    function normalizeFieldValue(value, rule, previousValue) {
      const raw = value === undefined || value === null ? '' : String(value);
      if (!raw.trim() && rule.secret && previousValue !== undefined) return previousValue;
      if (rule.normalize === 'url') {
        try {
          const parsed = new URL(raw.trim());
          if (!['http:', 'https:'].includes(parsed.protocol)) return '';
          parsed.pathname = parsed.pathname.replace(/\/+$/g, '');
          parsed.search = '';
          parsed.hash = '';
          return parsed.toString().replace(/\/$/g, '');
        } catch {
          return '';
        }
      }
      if (rule.normalize === 'email') return raw.trim().toLowerCase();
      if (rule.normalize === 'lower') return raw.trim().toLowerCase();
      return raw.trim();
    }

    function normalizeProviderConfig(providerOrState, rawConfig = {}, options = {}) {
      const definition = getProviderDefinition(providerOrState);
      if (!definition) return {};
      const source = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
      const previous = options.previousConfig && typeof options.previousConfig === 'object' ? options.previousConfig : {};
      const result = {};
      for (const field of definition.fields) {
        const rawValue = source[field.key] !== undefined ? source[field.key] : source[field.stateKey];
        const previousValue = previous[field.key] !== undefined ? previous[field.key] : previous[field.stateKey];
        const value = rawValue === undefined && field.defaultValue !== undefined
          ? field.defaultValue
          : normalizeFieldValue(rawValue, field, previousValue);
        if (value !== '' || field.defaultValue === undefined) result[field.key] = value;
      }
      return result;
    }

    function validateProviderConfig(providerOrState, rawConfig = {}) {
      const definition = getProviderDefinition(providerOrState);
      if (!definition) return { ok: false, errors: ['未知邮箱 Provider。'] };
      const config = normalizeProviderConfig(providerOrState, rawConfig);
      const errors = [];
      for (const field of definition.fields) {
        const value = String(config[field.key] || '').trim();
        if (field.required && !value) errors.push(`${field.key} 不能为空。`);
        if (value && field.normalize === 'url' && !/^https?:\/\//i.test(value)) errors.push(`${field.key} 必须是 HTTP(S) 地址。`);
        if (value && field.normalize === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors.push(`${field.key} 不是有效邮箱。`);
      }
      return { ok: errors.length === 0, errors, config };
    }

    function redactProviderConfig(providerOrState, rawConfig = {}) {
      const definition = getProviderDefinition(providerOrState);
      if (!definition) return {};
      const config = normalizeProviderConfig(providerOrState, rawConfig);
      const secretKeys = new Set(definition.fields.filter((field) => field.secret).map((field) => field.key));
      return Object.fromEntries(Object.entries(config).map(([key, value]) => [
        key,
        secretKeys.has(key) && value ? `${String(value).slice(0, 2)}***` : value,
      ]));
    }

    async function testProviderConnection(providerOrState, rawConfig = {}, options = {}) {
      const definition = getProviderDefinition(providerOrState);
      if (!definition) return { ok: false, reason: 'unknown_provider' };
      const validation = validateProviderConfig(providerOrState, rawConfig);
      if (!validation.ok) return { ok: false, reason: 'invalid_config', errors: validation.errors };
      if (typeof options.testConnection !== 'function') {
        return { ok: false, reason: definition.dedicatedUi ? 'dedicated_ui' : 'connection_test_unavailable' };
      }
      const result = await options.testConnection(validation.config);
      return { ok: Boolean(result?.ok ?? result), provider: definition.id, ...(result && typeof result === 'object' ? result : {}) };
    }

    return Object.freeze({
      ...EMAIL_PROVIDER_IDS,
      ...EMAIL_GENERATOR_IDS,
      EMAIL_PROVIDER_IDS,
      EMAIL_GENERATOR_IDS,
      normalizeEmailGenerator,
      isGeneratedAliasProvider,
      shouldUseCustomRegistrationEmail,
      getProviderDefinition,
      listProviderDefinitions,
      normalizeProviderConfig,
      validateProviderConfig,
      redactProviderConfig,
      testProviderConnection,
    });
  }

  return Object.freeze({
    create,
    EMAIL_PROVIDER_IDS,
    EMAIL_GENERATOR_IDS,
    PROVIDER_DEFINITIONS,
  });
});
