#!/usr/bin/env node
'use strict';

// The APP's own `postinstall`, or `npx symbiote-expo-link` by hand. Not a per-dependency
// lifecycle script, so cwd is the app root. Package managers extract the whole tree before
// running any postinstall, so the scan sees every installed package.
const { linkApp } = require('../src/index.cjs');

try {
  linkApp();
} catch (error) {
  // Never fail a consumer's install over this: an unlinked module fails loudly at runtime with
  // "Cannot find native module", whereas a non-zero exit here would break the whole install.
  console.error('[symbiote-expo-link] failed to link native modules, continuing install:', error.message);
}
