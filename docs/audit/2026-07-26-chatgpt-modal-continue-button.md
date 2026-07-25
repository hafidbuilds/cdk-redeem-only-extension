# ChatGPT modal Continue button recovery

## Problem

On the `chatgpt.com` login modal, the email field could be filled while the email Continue button was still disabled. Step 2 retained that pre-fill button state and checked it immediately, so it reported that no clickable Continue button existed even though the page enabled the button shortly afterward.

## Implementation

- The signup entry helper now re-queries the current Continue button after filling the email.
- It waits up to five seconds for the current button to become enabled, which also handles React replacing the original button node.
- Stop requests remain active during the wait.
- Existing exact action-text matching continues to exclude Google, Apple, phone, and other provider buttons.
- The main signup content script remains within its existing 7000-line audit limit; no threshold was raised.

## Verification

- Focused authentication-entry tests: 11/11 passed.
- Full Node test suite: 441/441 passed.
- Syntax checks: 384 tracked JavaScript files passed.
- Smoke, removed-network, and phone/SMS audits passed; only the existing `background.js` size warning remains.
- Manifest references: 25 checked, 0 missing.
- High-confidence tracked-source credential matches: 0.
