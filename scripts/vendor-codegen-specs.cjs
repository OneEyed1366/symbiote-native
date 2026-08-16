#!/usr/bin/env node

// react-native codegen resolves codegenConfig.jsSrcsDir as a LITERAL path relative to a package's
// own root (a plain lstat, not require() resolution). Under pnpm, a native-proxy package's
// wrapped native dependency is never nested in its own node_modules — pnpm places it as a SIBLING,
// reachable only via require.resolve's ancestor walk — so jsSrcsDir can never literally point
// through node_modules. Every native-proxy package instead vendors the wrapped library's codegen
// spec sources into its own `codegen-specs/` at `prepare` time and points jsSrcsDir at that real,
// resolvable copy. Shared here since the logic is identical across packages; only the wrapped
// package name and specs subdir differ. See `.claude/rules/native-proxy-package-files.md`.
const fs = require('fs');
const path = require('path');

const [, , packageName, specsSubdir] = process.argv;
if (!packageName || !specsSubdir) {
  console.error('Usage: vendor-codegen-specs.cjs <native-package-name> <specs-subdir>');
  process.exit(1);
}

// Resolve from the CALLING package's own directory (npm/pnpm scripts run with cwd = that
// package's root), not from this shared script's own location — the wrapped dependency is only
// ever reachable via the calling package's node_modules chain.
const nativePackageRoot = path.dirname(
  require.resolve(`${packageName}/package.json`, { paths: [process.cwd()] }),
);
const sourceDir = path.join(nativePackageRoot, specsSubdir);
const targetDir = path.join(process.cwd(), 'codegen-specs');

fs.rmSync(targetDir, { recursive: true, force: true });
fs.cpSync(sourceDir, targetDir, { recursive: true });
