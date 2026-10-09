// The standalone `PERMISSIONS` / `RESULTS` copies must equal the ones RN's module carries
// NOTE: the Android request path is not reachable headless, RN gates it on `Platform.OS`

import { describe, expect, it } from 'vitest';
import { PermissionsAndroid } from '../react-native-host';
import { PERMISSIONS, RESULTS } from './index';

describe('PermissionsAndroid constants', () => {
  it('PERMISSIONS matches RN key for key', () => {
    expect({ ...PERMISSIONS }).toEqual({ ...PermissionsAndroid.PERMISSIONS });
  });

  it('RESULTS matches RN key for key', () => {
    expect({ ...RESULTS }).toEqual({ ...PermissionsAndroid.RESULTS });
  });

  it('both are frozen like RN’s', () => {
    expect(Object.isFrozen(PERMISSIONS)).toBe(true);
    expect(Object.isFrozen(RESULTS)).toBe(true);
  });
});
