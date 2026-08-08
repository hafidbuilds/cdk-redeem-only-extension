import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function assertIncludes(source, value, label) {
  assert(source.includes(value), `${label} is missing ${JSON.stringify(value)}`);
}

function assertExcludes(source, pattern, label) {
  assert(!pattern.test(source), `${label} still matches ${pattern}`);
}

const manifest = JSON.parse(read('manifest.json'));
assert(manifest.name === 'Free Account Tool', 'manifest name must be Free Account Tool');
assert(manifest.version === '3.0.0', 'manifest version must be 3.0.0');
assert(manifest.version_name === 'Free Account Tool V3.0.0', 'manifest version_name must be Free Account Tool V3.0.0');
assert(manifest.permissions?.includes('unlimitedStorage'), 'unlimitedStorage permission must protect large Free Session/account datasets');
assert(manifest.host_permissions?.includes('https://cha.nerver.cc/*'), 'cha.nerver.cc permission must be retained');
assert(!manifest.host_permissions?.some((value) => /chong\.nerver\.cc/i.test(value)), 'chong.nerver.cc permission must be removed');

for (const requiredFile of [
  'shared/free-account-results.js',
  'background/free-account-service.js',
  'background/free-account-session-fill-task.js',
  'background/bootstrap/free-account-v3-migration.js',
  'sidepanel/account-records-manager.js',
  'sidepanel/account-records-membership-results-renderer.js',
  'scripts/test-free-account-v3.cjs',
]) {
  assert(exists(requiredFile), `required V3 file is missing: ${requiredFile}`);
}

for (const removedPath of [
  'shared/redeem-channel-state.js',
  'shared/membership-credential-format.js',
  'background/external-effect-ledger.js',
  'background/upi-credential-membership-checker.js',
  'background/routes/cdkey-routes.js',
  'background/router/redeem-refresh-service.js',
  'background/membership/plus-verification-service.js',
  'background/membership/redeem-service.js',
  'sidepanel/styles/cdk-pools.css',
  'sidepanel/account-records-redeem-actions.js',
]) {
  assert(!exists(removedPath), `removed file still exists: ${removedPath}`);
}

for (const removedDirectory of [
  'background/redeem',
  'background/steps/upi-redeem',
]) {
  const absolutePath = path.join(root, removedDirectory);
  assert(!exists(removedDirectory) || fs.readdirSync(absolutePath).length === 0, `removed directory still contains runtime files: ${removedDirectory}`);
}

const background = read('background.js');
assertIncludes(background, "'shared/free-account-results.js'", 'background imports');
assertIncludes(background, "'background/free-account-service.js'", 'background imports');
assertIncludes(background, "'background/free-account-session-fill-task.js'", 'background imports');
assertIncludes(background, "'background/bootstrap/free-account-v3-migration.js'", 'background imports');
assertExcludes(background, /background\/(?:redeem|steps\/upi-redeem)|external-effect-ledger|cdkey-routes|redeem-refresh-service/, 'background imports');

const dispatcher = read('background/router/message-dispatcher.js');
const membershipRoutes = read('background/routes/membership-routes.js');
const accountManager = read('sidepanel/account-records-manager.js');
const messageCorpus = `${dispatcher}\n${membershipRoutes}\n${accountManager}`;
for (const messageType of [
  'GET_FREE_ACCOUNT_RESULTS',
  'IMPORT_FREE_ACCOUNT_RESULTS',
  'EXPORT_FREE_ACCOUNT_RESULTS',
  'DELETE_FREE_ACCOUNT_RESULTS',
  'CHECK_FREE_ACCOUNT_ELIGIBILITY',
  'LOGIN_FREE_ACCOUNT',
  'FILL_FREE_ACCOUNT_ACCESS_TOKENS',
  'REFRESH_FREE_ACCOUNT_ACCESS_TOKENS',
  'STOP_FREE_ACCOUNT_CHECK',
  'START_FILL_FREE_ACCOUNT_SESSIONS',
  'RESUME_FREE_ACCOUNT_SESSION_FILL',
  'STOP_FREE_ACCOUNT_SESSION_FILL',
]) {
  assertIncludes(messageCorpus, messageType, 'Free account message routes');
}
assertExcludes(messageCorpus, /\b(?:REDEEM_[A-Z0-9_]*|[A-Z0-9_]*_CDKEY_[A-Z0-9_]*|IDENTIFY_[A-Z0-9_]*_PLUS|VERIFY_[A-Z0-9_]*_PLUS|MOVE_[A-Z0-9_]*_GROUP)\b/, 'Free account message routes');

const resultsModule = read('shared/free-account-results.js');
assertIncludes(resultsModule, 'const SCHEMA_VERSION = 3;', 'Free result schema');
assertIncludes(resultsModule, "const STORAGE_KEY = 'freeAccountResults';", 'Free result schema');
assertIncludes(resultsModule, "return getItemEligibilityStatus(item) === 'ineligible' ? 'free-ineligible' : 'free';", 'Free result grouping');

const accountSchema = read('shared/account-record-schema.js');
assertIncludes(accountSchema, "const MEMBERSHIP_STATUSES = new Set(['unknown', 'free']);", 'canonical account schema');
assertExcludes(accountSchema, /MEMBERSHIP_STATUSES[^\n]*plus/, 'canonical account schema');

const renderer = read('sidepanel/account-records-membership-results-renderer.js');
assertIncludes(renderer, "renderSection('free', 'Free 组'", 'Free account renderer');
assertIncludes(renderer, "renderSection('free-ineligible', '无资格 Free 组'", 'Free account renderer');
assertIncludes(renderer, '总账号', 'Free account renderer summary');
assertIncludes(renderer, '有资格', 'Free account renderer summary');
assertIncludes(renderer, '待检测', 'Free account renderer summary');
assertIncludes(renderer, '检测失败', 'Free account renderer summary');
assertIncludes(renderer, '缺 AT', 'Free account renderer summary');
assertIncludes(renderer, '缺 Session', 'Free account renderer summary');
assertIncludes(renderer, '补充 Session', 'Free account renderer actions');
assertExcludes(renderer, /Plus 组|兑换|移动/, 'Free account renderer');

const sidepanelHtml = read('sidepanel/sidepanel.html');
const sidepanelController = read('sidepanel/sidepanel-app-controller.js');
const sidepanelRuntimeHandler = read('sidepanel/runtime-message-data-handler.js');
assertIncludes(sidepanelHtml, '<title>Free Account Tool V3.0.0</title>', 'sidepanel title');
assertIncludes(sidepanelHtml, 'href="https://gcash.20000408.xyz/"', 'GCash public tool entry');
assertIncludes(sidepanelHtml, 'id="input-gcash-eligibility-api-token"', 'GCash eligibility token setting');
assertIncludes(sidepanelController, 'gcashEligibilityApiToken: String(inputGcashEligibilityApiToken?.value', 'GCash eligibility token persistence');
assertIncludes(sidepanelRuntimeHandler, 'message.payload.gcashEligibilityApiToken', 'GCash eligibility token runtime restore');
assertIncludes(sidepanelHtml, 'href="https://cdk.334401.xyz/"', 'CDK public tool entry');
assertIncludes(sidepanelHtml, 'target="_blank" rel="noopener noreferrer"', 'public tool external-link safety');
assertExcludes(sidepanelHtml, /卡密池|兑换按钮|UPI Plus|IDEAL Plus|PIX Plus|全部 Plus 操作/, 'sidepanel HTML');

const settingsDefaults = read('background/bootstrap/settings-defaults.js');
assertIncludes(settingsDefaults, 'const SETTINGS_EXPORT_SCHEMA_VERSION = 3;', 'settings export schema');
assertIncludes(settingsDefaults, "gcashEligibilityApiToken: ''", 'GCash eligibility token default');
assertExcludes(settingsDefaults, /RedeemCdkey|CdkPool|cdkPool|redeemStatus/, 'settings defaults');

const taskSchema = read('shared/task-schema.js');
assertIncludes(taskSchema, "'check_eligibility'", 'task types');
assertIncludes(taskSchema, "'fill_session'", 'task types');
assertExcludes(taskSchema, /['"](?:redeem|verify_membership)['"]/, 'task types');

const runtimeFiles = [
  'background.js',
  ...fs.readdirSync(path.join(root, 'background'), { recursive: true })
    .filter((entry) => /\.js$/i.test(entry))
    .map((entry) => `background/${String(entry).replaceAll('\\', '/')}`),
  ...fs.readdirSync(path.join(root, 'sidepanel'), { recursive: true })
    .filter((entry) => /\.(?:js|html|css)$/i.test(entry))
    .map((entry) => `sidepanel/${String(entry).replaceAll('\\', '/')}`),
].filter((entry) => ![
  'background/bootstrap/free-account-v3-migration.js',
  'background/account-record-migration.js',
  'background/bootstrap/settings-transfer-security.js',
  'sidepanel/failure-diagnostics.js',
  'sidepanel/update-service.js',
  'sidepanel/contribution-mode.js',
].includes(entry));
const runtimeCorpus = runtimeFiles.map((entry) => read(entry)).join('\n');
assertExcludes(runtimeCorpus, /\b(?:upi|ideal|pix)(?:Channel)?RedeemCdkey(?:PoolText|Usage)\b/, 'runtime source');
assertExcludes(runtimeCorpus, /\b(?:upiRedeemAccessToken|redeemChannel|membershipChannel|paidChannels)\b/, 'runtime source');
assertExcludes(runtimeCorpus, /\b(?:verify_membership|type\s*:\s*['"]redeem['"])\b/, 'runtime source');

const rules = read('rules.json');
assertExcludes(rules, /chong\.nerver\.cc/i, 'DNR rules');

if (failures.length) {
  console.error(`V3 smoke audit failed with ${failures.length} issue(s):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`V3 smoke audit passed (${runtimeFiles.length} runtime files checked).`);
}
