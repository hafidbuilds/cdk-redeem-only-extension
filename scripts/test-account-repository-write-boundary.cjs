const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function listProductionFiles(directory) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    return entry.isDirectory() ? listProductionFiles(relative) : [relative];
  }).filter((file) => file.endsWith('.js'));
}

test('only account-repository writes the canonical account storage key', () => {
  const writers = [];
  for (const file of ['background.js', ...listProductionFiles('background'), ...listProductionFiles('sidepanel'), ...listProductionFiles('shared')]) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    if (/storage\.local\.set\s*\(\s*\{[^}]*accountRecordsV2/s.test(source)
      || /storage\.local\.set\s*\(\s*\{[^}]*ACCOUNT_RECORDS_STORAGE_KEY/s.test(source)) {
      writers.push(file.replace(/\\/g, '/'));
    }
  }
  assert.deepEqual(writers, ['background/account-repository.js']);
});

test('sidepanel never directly writes the canonical account key', () => {
  const offenders = listProductionFiles('sidepanel').filter((file) => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    return source.includes('accountRecordsV2') && /chrome\.storage\.(?:local|session)\.set/.test(source);
  });
  assert.deepEqual(offenders, []);
});
