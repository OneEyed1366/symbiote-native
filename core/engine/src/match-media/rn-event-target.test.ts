// `MediaQueryList` extends the global `EventTarget`, so RN has to keep defining it at startup
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const setUpDom = readFileSync(
  path.join(
    path.dirname(require.resolve('react-native/package.json')),
    'src/private/setup/setUpDOM.js',
  ),
  'utf8',
);

describe('the React Native startup that matchMedia relies on', () => {
  it.each(['Event', 'EventTarget'])('polyfills the global %s', name => {
    expect(setUpDom).toMatch(new RegExp(`polyfillGlobal\\(\\s*'${name}',`));
  });

  it('does not polyfill a global it never names', () => {
    expect(setUpDom).not.toMatch(/polyfillGlobal\(\s*'MediaQueryList'/);
  });
});
