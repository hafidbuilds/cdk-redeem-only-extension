const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createSessionExportReader,
  isTransientSessionFrameError,
} = require('../background/session-export-reader.js');

test('session reader recognizes Chrome main-frame replacement errors', () => {
  assert.equal(isTransientSessionFrameError(new Error('Frame with ID 0 was removed.')), true);
  assert.equal(isTransientSessionFrameError(new Error('No frame with id 0 in tab 42.')), true);
  assert.equal(isTransientSessionFrameError(new Error('Current SESSION has no access token.')), false);
});

test('session reader re-resolves tabs after the main frame is replaced', async () => {
  let resolveCount = 0;
  const reads = [];
  const retries = [];
  const reader = createSessionExportReader({
    resolveTabs: async () => {
      resolveCount += 1;
      return resolveCount === 1
        ? [{ id: 10, url: 'https://auth.openai.com/create-account/profile' }]
        : [{ id: 11, url: 'https://chatgpt.com/' }];
    },
    pickPreferredTab: (tabs) => tabs[0],
    readFromTab: async (tab) => {
      reads.push(tab.id);
      if (tab.id === 10) throw new Error('Frame with ID 0 was removed.');
      return { accessToken: 'fixture-at', session: { user: { email: 'user@example.com' } } };
    },
    sleep: async () => {},
    onRetry: async (details) => retries.push(details),
  });

  const result = await reader.readCurrentSession();

  assert.equal(result.accessToken, 'fixture-at');
  assert.deepEqual(reads, [10, 11]);
  assert.equal(resolveCount, 2);
  assert.equal(retries.length, 1);
  assert.equal(retries[0].nextAttempt, 2);
});

test('session reader does not retry a real session response failure', async () => {
  let resolveCount = 0;
  const expected = new Error('当前 SESSION 中没有 accessToken。');
  const reader = createSessionExportReader({
    resolveTabs: async () => {
      resolveCount += 1;
      return [{ id: 20, url: 'https://chatgpt.com/' }];
    },
    pickPreferredTab: (tabs) => tabs[0],
    readFromTab: async () => {
      throw expected;
    },
  });

  await assert.rejects(() => reader.readCurrentSession(), (error) => error === expected);
  assert.equal(resolveCount, 1);
});

test('session reader returns a structured manual-recovery error after recovery is exhausted', async () => {
  let readCount = 0;
  const reader = createSessionExportReader({
    resolveTabs: async () => [{ id: 30, url: 'https://chatgpt.com/' }],
    pickPreferredTab: (tabs) => tabs[0],
    readFromTab: async () => {
      readCount += 1;
      throw new Error('Frame with ID 0 was removed.');
    },
    sleep: async () => {},
    maxAttempts: 3,
  });

  await assert.rejects(
    () => reader.readCurrentSession(),
    (error) => {
      assert.equal(error.code, 'CHATGPT_SESSION_FRAME_UNAVAILABLE');
      assert.equal(error.retryable, false);
      assert.equal(error.recoverable, true);
      assert.equal(error.resumeNodeId, 'persist-no-2fa-free');
      assert.match(error.message, /重新定位标签页 3 次/);
      return true;
    }
  );
  assert.equal(readCount, 3);
});
