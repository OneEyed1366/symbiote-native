#!/usr/bin/env node
'use strict';

// Runs as the `postinstall` script of an expo-modules-core wrapper package (sensors,
// local-auth, ...). npm/pnpm run a package's own lifecycle scripts with cwd = that package's
// own root (same convention as scripts/vendor-codegen-specs.cjs), so process.cwd() here is
// the WRAPPER package's directory, not the consuming app's — the app root is found separately
// via INIT_CWD inside linkPackage().
const fs = require('node:fs');
const path = require('node:path');
const { linkPackage } = require('../src/index.cjs');

const manifestPath = path.join(process.cwd(), 'native-link.json');

if (!fs.existsSync(manifestPath)) {
  // A missing manifest is a packaging bug in the calling package, not something that should
  // ever fail a consumer's `npm install` — report and move on.
  console.error(`[symbiote-expo-link] no native-link.json found at ${manifestPath}`);
  process.exit(0);
}

try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  linkPackage(manifest);
} catch (error) {
  console.error('[symbiote-expo-link] failed to link native module, continuing install:', error.message);
}
