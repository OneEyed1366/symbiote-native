// RN's own `ReactNativeVersion` is baked into its JS, so it is the installed package's version

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { ReactNativeVersion } from './index';

const installed: { version: string } = createRequire(import.meta.url)(
  'react-native/package.json',
);

describe('ReactNativeVersion', () => {
  it('is the version of the installed react-native package', () => {
    expect(ReactNativeVersion.getVersionString()).toBe(installed.version);
  });

  it('exposes the parts as numbers and no prerelease on a release', () => {
    const [major, minor, patch] = installed.version.split('.').map(Number);

    expect([
      ReactNativeVersion.major,
      ReactNativeVersion.minor,
      ReactNativeVersion.patch,
    ]).toEqual([major, minor, patch]);
    expect(ReactNativeVersion.prerelease).toBeNull();
  });
});
