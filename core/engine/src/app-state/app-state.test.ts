// RN's `AppState` reached through the host, over the native module vitest.config.ts stubs (the app
// launched 'active'). The state machine is RN's, so this proves the wiring and the throw we lean on

import { describe, expect, it, vi } from 'vitest';
import { emitRnDeviceEvent } from '../../../test-utils/src/rn-device-event';
import { AppState } from '../react-native-host';

describe('AppState', () => {
  describe('Positive (a read or a native event succeeds)', () => {
    it('reports the state the app launched in and that native is linked', () => {
      expect(AppState.currentState).toBe('active');
      expect(AppState.isAvailable).toBe(true);
    });

    it('tells a change listener the new state and keeps currentState in sync', () => {
      const listener = vi.fn();
      const subscription = AppState.addEventListener('change', listener);

      emitRnDeviceEvent('appStateDidChange', { app_state: 'background' });

      expect(listener).toHaveBeenCalledWith('background');
      expect(AppState.currentState).toBe('background');
      subscription.remove();
      emitRnDeviceEvent('appStateDidChange', { app_state: 'active' });
    });

    it('stops telling a listener once it is removed', () => {
      const listener = vi.fn();
      AppState.addEventListener('change', listener).remove();

      emitRnDeviceEvent('appStateDidChange', { app_state: 'inactive' });

      expect(listener).not.toHaveBeenCalled();
      emitRnDeviceEvent('appStateDidChange', { app_state: 'active' });
    });

    it('fires memoryWarning when native sends one', () => {
      const listener = vi.fn();
      const subscription = AppState.addEventListener('memoryWarning', listener);

      emitRnDeviceEvent('memoryWarning', undefined);

      expect(listener).toHaveBeenCalledOnce();
      subscription.remove();
    });

    it('splits the one focus boolean into focus and blur', () => {
      const focus = vi.fn();
      const blur = vi.fn();
      const subscriptions = [
        AppState.addEventListener('focus', focus),
        AppState.addEventListener('blur', blur),
      ];

      emitRnDeviceEvent('appStateFocusChange', true);
      emitRnDeviceEvent('appStateFocusChange', false);

      expect(focus).toHaveBeenCalledOnce();
      expect(blur).toHaveBeenCalledOnce();
      for (const subscription of subscriptions) subscription.remove();
    });
  });

  describe('Negative (RN throws, and that throw is the contract)', () => {
    it('rejects an event it does not know', () => {
      expect(() =>
        Reflect.apply(AppState.addEventListener, undefined, [
          'nonsense',
          () => {},
        ]),
      ).toThrow('Trying to subscribe to unknown event: nonsense');
    });
  });
});
