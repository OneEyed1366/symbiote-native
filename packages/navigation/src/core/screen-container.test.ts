import { describe, expect, it } from 'vitest';
import { resolveScreenContainerViewName } from './screen-container';
import { enableScreens } from './screens-config';

describe('screen container view name', () => {
  it('uses the native container on iOS and Android', () => {
    expect(resolveScreenContainerViewName({ os: 'ios' })).toBe(
      'RNSScreenContainer',
    );
    expect(resolveScreenContainerViewName({ os: 'android' })).toBe(
      'RNSScreenContainer',
    );
  });

  it('uses the two-state container on iOS when screens show one at a time', () => {
    expect(
      resolveScreenContainerViewName({ os: 'ios', hasTwoStates: true }),
    ).toBe('RNSScreenNavigationContainer');
  });

  it('keeps the plain container on Android for two states', () => {
    expect(
      resolveScreenContainerViewName({ os: 'android', hasTwoStates: true }),
    ).toBe('RNSScreenContainer');
  });

  it('falls back to a plain view when the app turns screens off', () => {
    expect(resolveScreenContainerViewName({ os: 'ios', enabled: false })).toBe(
      'view',
    );
    expect(
      resolveScreenContainerViewName({
        os: 'ios',
        enabled: false,
        hasTwoStates: true,
      }),
    ).toBe('view');
  });

  it('falls back to a plain view where the platform has no native screens', () => {
    expect(resolveScreenContainerViewName({ os: 'web' })).toBe('view');
  });

  it('follows the app-wide `enableScreens` switch when the container sets no `enabled`', () => {
    enableScreens(false);
    try {
      expect(resolveScreenContainerViewName({ os: 'ios' })).toBe('view');
      expect(resolveScreenContainerViewName({ os: 'ios', enabled: true })).toBe(
        'RNSScreenContainer',
      );
    } finally {
      enableScreens(true);
    }
  });
});
