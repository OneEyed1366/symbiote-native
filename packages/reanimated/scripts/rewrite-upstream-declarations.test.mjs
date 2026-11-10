// Runs under root `pnpm test:node` discovery, like the scripts/ ones
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  rewriteUpstreamSpecifiers,
  rewriteDeclarations,
} from './rewrite-upstream-declarations.mjs';

test('points an import of upstream source at its declarations', () => {
  const { code, rewritten } = rewriteUpstreamSpecifiers(
    `import type { SharedValue } from 'react-native-reanimated/src/commonTypes';`,
  );

  assert.equal(
    code,
    `import type { SharedValue } from 'react-native-reanimated/lib/typescript/commonTypes';`,
  );
  assert.equal(rewritten, 1);
});

test('points a re-export and a dynamic type import at them too', () => {
  const { code, rewritten } = rewriteUpstreamSpecifiers(
    [
      `export type { X } from "react-native-reanimated/src/hook/commonTypes";`,
      `type Y = import('react-native-reanimated/src/animation').Y;`,
    ].join('\n'),
  );

  assert.match(
    code,
    /"react-native-reanimated\/lib\/typescript\/hook\/commonTypes"/,
  );
  assert.match(code, /'react-native-reanimated\/lib\/typescript\/animation'/);
  assert.equal(rewritten, 2);
});

test('leaves the public entry and other packages alone', () => {
  const source = [
    `export { withTiming } from 'react-native-reanimated';`,
    `import type { X } from 'react-native-worklets/src/y';`,
  ].join('\n');

  const { code, rewritten } = rewriteUpstreamSpecifiers(source);

  assert.equal(code, source);
  assert.equal(rewritten, 0);
});

test('both builds that ship declarations get them rewritten', () => {
  const manifest = JSON.parse(
    fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );

  assert.match(manifest.scripts.build, /rewrite-upstream-declarations\.mjs build$/);
  assert.match(
    manifest.scripts['ng:build'],
    /rewrite-upstream-declarations\.mjs build-ngc$/,
  );
});

test('rewrites every declaration file under a directory, and only those', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewrite-dts-'));
  fs.mkdirSync(path.join(dir, 'core'));
  const declaration = path.join(dir, 'core', 'a.d.ts');
  const script = path.join(dir, 'core', 'a.js');
  const original = `import 'react-native-reanimated/src/a';`;
  fs.writeFileSync(declaration, original);
  fs.writeFileSync(script, original);

  const total = rewriteDeclarations(dir);

  assert.equal(total, 1);
  assert.match(fs.readFileSync(declaration, 'utf8'), /lib\/typescript\/a/);
  assert.equal(fs.readFileSync(script, 'utf8'), original);
});
