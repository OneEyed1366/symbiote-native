#!/usr/bin/env node

// react-native codegen resolves codegenConfig.jsSrcsDir as a LITERAL path relative to
// this package's own root (a plain lstat, not Node's require() resolution). Under pnpm,
// a real npm install of this package never nests react-native-bootsplash inside its own
// node_modules — pnpm places it as a SIBLING in the enclosing store directory, reachable
// only by require.resolve's ancestor walk. So jsSrcsDir can never literally point through
// node_modules; instead we vendor the spec files into our own package at prepare time and
// point jsSrcsDir at that copy — real files, resolvable the same way regardless of how the
// package manager laid out its dependencies.
const fs = require('fs');
const path = require('path');

const nativeSplashScreenRoot = path.dirname(require.resolve('react-native-bootsplash/package.json'));
const specsDir = path.join(nativeSplashScreenRoot, 'src', 'specs');
const targetDir = path.join(__dirname, 'codegen-specs');

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });

for (const file of fs.readdirSync(specsDir)) {
  fs.copyFileSync(path.join(specsDir, file), path.join(targetDir, file));
}
