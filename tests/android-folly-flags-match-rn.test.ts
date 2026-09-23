// The engine's Android library links against libreactnative.so's folly, so it must compile folly's
// headers with the SAME defines. A drift is not a warning: FOLLY_MOBILE alone flips F14's layout,
// and the link fails on `folly::f14::detail::F14LinkCheck<1>::check()` from any folly::dynamic.
// RN owns the list (ReactAndroid/cmake-utils/folly-flags.cmake); a react-native bump that changes
// it fails here instead of in a Gradle build.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const RN_FOLLY_FLAGS = join(
  dirname(require.resolve('react-native/package.json')),
  'ReactAndroid/cmake-utils/folly-flags.cmake',
);
const ENGINE_CMAKE = join(
  import.meta.dirname,
  '../core/engine/android/CMakeLists.txt',
);

function follyDefines(path: string): string[] {
  const code = readFileSync(path, 'utf8')
    .split('\n')
    .map((line: string) => line.replace(/#.*/, ''))
    .join('\n');
  return [...new Set(code.match(/-DFOLLY_\w+=\w+/g) ?? [])].sort();
}

describe('android folly flags', () => {
  it('engine CMakeLists defines exactly the folly flags RN builds folly with', () => {
    const rn = follyDefines(RN_FOLLY_FLAGS);
    expect(rn).toContain('-DFOLLY_MOBILE=1');
    expect(follyDefines(ENGINE_CMAKE)).toEqual(rn);
  });
});
