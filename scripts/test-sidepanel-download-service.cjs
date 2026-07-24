const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadDownloadApi() {
  const window = {};
  const source = fs.readFileSync(path.join(__dirname, '../sidepanel/download-service.js'), 'utf8');
  vm.runInNewContext(source, { window, document: {}, Blob, URL, setTimeout });
  return window.SidepanelDownloadService;
}

test('download service builds stable timestamps from supplied dates', () => {
  const api = loadDownloadApi();
  assert.equal(api.buildDownloadFileTimestamp(new Date(2026, 6, 25, 1, 2, 3)), '20260725-010203');
});

test('download service sanitizes names and assigns extensions', () => {
  const api = loadDownloadApi();
  assert.equal(api.normalizeDownloadFileName(' report:one ', 'application/json'), 'report-one.json');
  assert.equal(api.normalizeDownloadFileName('report.txt', 'text/plain'), 'report.txt');
});

test('download service infers only supported text extensions', () => {
  const api = loadDownloadApi();
  assert.equal(api.inferDownloadExtension('application/json;charset=utf-8'), 'json');
  assert.equal(api.inferDownloadExtension('text/plain'), 'txt');
  assert.equal(api.inferDownloadExtension('application/octet-stream'), 'txt');
});
