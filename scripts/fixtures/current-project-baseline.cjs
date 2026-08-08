const checkedAt = '2026-07-25T00:00:00.000Z';

const accounts = Object.freeze({
  eligible: Object.freeze({
    email: 'eligible.account@example.com',
    password: 'fixture-password',
    totpMfaSecret: 'FIXTURETOTPSECRET',
    accessToken: 'fixture-access-token',
    accessTokenStatus: 'valid',
    trialEligibilityStatus: 'eligible',
    membershipStatus: 'free',
    checkedAt,
  }),
  unknown: Object.freeze({ email: 'unknown.account@example.com', trialEligibilityStatus: 'unknown', membershipStatus: 'free' }),
  failed: Object.freeze({
    email: 'failed.account@example.com',
    trialEligibilityStatus: 'failed',
    membershipStatus: 'free',
    reasonCode: 'FREE_ACCOUNT_ELIGIBILITY_FAILED',
  }),
  ineligible: Object.freeze({
    email: 'ineligible.account@example.com',
    trialEligibilityStatus: 'ineligible',
    membershipStatus: 'free',
    reasonCode: 'UPI_ACCOUNT_INELIGIBLE',
    checkedAt,
  }),
  missingAccessToken: Object.freeze({
    email: 'missing.at@example.com',
    accessToken: '',
    accessTokenStatus: 'missing',
    membershipStatus: 'free',
  }),
  deactivated: Object.freeze({
    email: 'deactivated.account@example.com',
    validityStatus: 'deactivated',
    accessTokenStatus: 'invalid',
    membershipStatus: 'free',
    reasonCode: 'ACCOUNT_DEACTIVATED',
  }),
});

module.exports = Object.freeze({ accounts, checkedAt });
