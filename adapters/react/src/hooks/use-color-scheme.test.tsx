// `useColorScheme` is the hook of `react-native` itself, so its re-render rules are RN's

import { describe, expect, it } from 'vitest';
// @ts-expect-error - untyped Flow source
import useColorSchemeUpstream from 'react-native/Libraries/Utilities/useColorScheme';
import { useColorScheme } from './use-color-scheme';

describe('useColorScheme', () => {
  it('is the hook of react-native, not a copy', () => {
    expect(useColorScheme).toBe(useColorSchemeUpstream);
  });
});
