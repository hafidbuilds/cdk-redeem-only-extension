const checkedAt = '2026-07-25 00:00:00';

const accounts = Object.freeze({
  free: Object.freeze({
    email: 'free.account@example.com',
    password: 'fixture-password',
    totpMfaSecret: 'FIXTURETOTPSECRET',
    accessToken: 'fixture-access-token',
    accessTokenStatus: 'valid',
    trialEligibilityStatus: 'eligible',
    membershipStatus: 'free',
    checkedAt,
  }),
  upiPlus: Object.freeze({
    email: 'upi.plus@example.com',
    membershipStatus: 'plus',
    redeemChannel: 'upi',
    upiRedeemSuccess: true,
    idealRedeemSuccess: false,
    pixRedeemSuccess: false,
  }),
  idealPlus: Object.freeze({
    email: 'ideal.plus@example.com',
    membershipStatus: 'plus',
    redeemChannel: 'ideal',
    upiRedeemSuccess: false,
    idealRedeemSuccess: true,
    pixRedeemSuccess: false,
  }),
  pixPlus: Object.freeze({
    email: 'pix.plus@example.com',
    membershipStatus: 'plus',
    redeemChannel: 'pix',
    upiRedeemSuccess: false,
    idealRedeemSuccess: false,
    pixRedeemSuccess: true,
  }),
  missingAccessToken: Object.freeze({
    email: 'missing.at@example.com',
    accessToken: '',
    accessTokenStatus: 'missing',
    membershipStatus: 'free',
  }),
  invalidAccessToken: Object.freeze({
    email: 'invalid.at@example.com',
    accessToken: '',
    accessTokenStatus: 'invalid',
    membershipStatus: 'free',
    reasonCode: 'AUTH_TOKEN_INVALID_CONFIRMED',
  }),
  deactivated: Object.freeze({
    email: 'deactivated.account@example.com',
    validityStatus: 'deactivated',
    accessToken: '',
    accessTokenStatus: 'invalid',
    membershipStatus: 'free',
    reasonCode: 'ACCOUNT_DEACTIVATED',
  }),
});

const channels = Object.freeze({
  upi: Object.freeze({
    pool: Object.freeze(['FIXTURE-UPI-0001']),
    failureCount: 1,
    remoteStatus: 'failed',
  }),
  ideal: Object.freeze({
    pool: Object.freeze(['FIXTURE-IDEAL-0001']),
    failureCount: 2,
    remoteStatus: 'pending',
  }),
  pix: Object.freeze({
    pool: Object.freeze(['FIXTURE-PIX-0001']),
    failureCount: 0,
    remoteStatus: 'success',
  }),
});

const redeemChoice = Object.freeze({
  upi: Object.freeze({ candidateCount: 2, cdkeyCount: 0, redeemCount: 0 }),
  ideal: Object.freeze({ candidateCount: 0, cdkeyCount: 1, redeemCount: 0 }),
  pix: Object.freeze({ candidateCount: 2, cdkeyCount: 1, redeemCount: 1 }),
});

module.exports = Object.freeze({ accounts, channels, checkedAt, redeemChoice });
