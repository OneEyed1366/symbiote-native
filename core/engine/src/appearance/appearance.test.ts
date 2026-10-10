// RN's `Appearance` reached through the host, over the native module vitest.config.ts stubs (the
// system scheme is 'light'). It never throws, so there is no Negative group

import { afterEach, describe, expect, it, vi } from 'vitest';
import { emitRnDeviceEvent } from '../../../test-utils/src/rn-device-event';
import { Appearance } from '../react-native-host';

afterEach(() => {
  Appearance.setColorScheme('unspecified');
});

describe('Appearance', () => {
  it('reads the system scheme native reports', () => {
    expect(Appearance.getColorScheme()).toBe('light');
  });

  it('keeps an explicit scheme the app set', () => {
    Appearance.setColorScheme('dark');

    expect(Appearance.getColorScheme()).toBe('dark');
  });

  it("goes back to the system scheme on 'unspecified'", () => {
    Appearance.setColorScheme('dark');
    Appearance.setColorScheme('unspecified');

    expect(Appearance.getColorScheme()).toBe('light');
  });

  it('tells a listener about a system switch and keeps what it reads in sync', () => {
    const listener = vi.fn();
    const subscription = Appearance.addChangeListener(listener);

    emitRnDeviceEvent('appearanceChanged', { colorScheme: 'dark' });

    expect(listener).toHaveBeenCalledWith({ colorScheme: 'dark' });
    expect(Appearance.getColorScheme()).toBe('dark');
    subscription.remove();
  });

  it('stops telling a listener once it is removed', () => {
    const listener = vi.fn();
    Appearance.addChangeListener(listener).remove();

    emitRnDeviceEvent('appearanceChanged', { colorScheme: 'dark' });

    expect(listener).not.toHaveBeenCalled();
  });
});
