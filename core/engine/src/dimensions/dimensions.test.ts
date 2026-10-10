// RN's `Dimensions` reached through the host, over the 390x844 at 3x window vitest.config.ts stubs
// as `DeviceInfo`. The metrics logic is RN's, so this proves the wiring and the contract we lean on

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dimensions } from '../react-native-host';

const SIMULATOR = { width: 390, height: 844, scale: 3, fontScale: 1 };
const ROTATED = { width: 844, height: 390, scale: 3, fontScale: 1 };

afterEach(() => {
  Dimensions.set({ window: SIMULATOR, screen: SIMULATOR });
});

describe('Dimensions', () => {
  describe('Positive (a read or a native push succeeds)', () => {
    it('hands back the window and screen metrics native shipped', () => {
      expect(Dimensions.get('window')).toEqual(SIMULATOR);
      expect(Dimensions.get('screen')).toEqual(SIMULATOR);
    });

    it('turns a native push into what get() answers and tells the listeners', () => {
      const listener = vi.fn();
      const subscription = Dimensions.addEventListener('change', listener);

      Dimensions.set({ window: ROTATED, screen: ROTATED });

      expect(Dimensions.get('window')).toEqual(ROTATED);
      expect(listener).toHaveBeenCalledWith({
        window: ROTATED,
        screen: ROTATED,
      });
      subscription.remove();
    });

    it('stops telling a listener once it is removed', () => {
      const listener = vi.fn();
      Dimensions.addEventListener('change', listener).remove();

      Dimensions.set({ window: ROTATED, screen: ROTATED });

      expect(listener).not.toHaveBeenCalled();
    });

    it('divides the physical pixels Android reports by the scale', () => {
      const physical = { ...SIMULATOR, width: 1_200, height: 2_400 };

      Dimensions.set({ windowPhysicalPixels: physical });

      expect(Dimensions.get('window')).toEqual({
        width: 400,
        height: 800,
        scale: 3,
        fontScale: 1,
      });
    });
  });

  describe('Negative (RN throws, and that throw is the contract)', () => {
    it('rejects a key that was never set', () => {
      expect(() => Reflect.apply(Dimensions.get, undefined, ['nope'])).toThrow(
        'No dimension set for key nope',
      );
    });

    it('rejects an event other than change', () => {
      expect(() =>
        Reflect.apply(Dimensions.addEventListener, undefined, [
          'resize',
          () => {},
        ]),
      ).toThrow('Trying to subscribe to unknown event: "resize"');
    });
  });
});
