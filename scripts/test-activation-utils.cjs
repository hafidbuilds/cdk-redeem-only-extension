const assert = require('node:assert/strict');
const test = require('node:test');

const activation = require('../content/activation-utils.js');

test('reset password submit buttons use native form submission', () => {
  assert.deepEqual(activation.getActivationStrategy({
    tagName: 'button',
    type: 'submit',
    hasForm: true,
    pathname: '/reset-password/new-password',
  }), { method: 'requestSubmit' });
});

test('ordinary buttons keep native click behavior', () => {
  assert.deepEqual(activation.getActivationStrategy({
    tagName: 'button',
    type: 'button',
    hasForm: false,
    pathname: '/',
  }), { method: 'click' });
});
