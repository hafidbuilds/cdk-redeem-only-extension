const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.SidepanelTaskEventViewModel = {
  toEventView(event = {}) {
    return {
      level: event.level || 'info',
      createdLabel: event.createdAt || '',
      code: event.code || '',
      message: event.message || '',
    };
  },
};
const renderer = require('../sidepanel/task-event-renderer.js');

function createNode(documentRef) {
  return {
    ownerDocument: documentRef,
    children: [],
    dataset: {},
    className: '',
    textContent: '',
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren() { this.children = []; },
    setAttribute() {},
  };
}

function createContainer({ scrollTop, scrollHeight, clientHeight }) {
  const documentRef = { createElement: () => createNode(documentRef) };
  return {
    ...createNode(documentRef),
    hidden: true,
    scrollTop,
    scrollHeight,
    clientHeight,
  };
}

test('event renderer preserves position when the user has scrolled up', () => {
  const container = createContainer({ scrollTop: 100, scrollHeight: 1000, clientHeight: 200 });

  renderer.renderEvents(container, { taskId: 'task_a' }, [{ code: 'FAILURE', message: 'earlier failure' }]);

  assert.equal(container.scrollTop, 100);
});

test('event renderer follows the newest event while already near the bottom', () => {
  const container = createContainer({ scrollTop: 790, scrollHeight: 1000, clientHeight: 200 });

  renderer.renderEvents(container, { taskId: 'task_a' }, [{ code: 'LATEST', message: 'latest event' }]);

  assert.equal(container.scrollTop, 1000);
});
