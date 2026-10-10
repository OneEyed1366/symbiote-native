// RN's `Linking` reached through the host, on the iOS path with LinkingManager recorded by
// vitest.config.ts. The URL checks are RN's, so this proves the wiring and the throws we lean on

import { describe, expect, it, vi } from 'vitest';
import { emitRnDeviceEvent } from '../../../test-utils/src/rn-device-event';
import { nativeCallsTo } from '../../../test-utils/src/native-calls';
import { Linking } from '../react-native-host';

describe('Linking', () => {
  describe('Positive (a call reaches native or an event reaches the app)', () => {
    it('hands the url to LinkingManager.openURL', async () => {
      await Linking.openURL('https://x');

      expect(nativeCallsTo('LinkingManager').at(-1)).toMatchObject({
        method: 'openURL',
        args: ['https://x'],
      });
    });

    it("resolves native's answer to canOpenURL", async () => {
      await expect(Linking.canOpenURL('https://x')).resolves.toBe(true);
    });

    it('tells a listener about a native deep link, then stops once removed', () => {
      const listener = vi.fn();
      const subscription = Linking.addEventListener('url', listener);

      emitRnDeviceEvent('url', { url: 'app://deep' });
      subscription.remove();
      emitRnDeviceEvent('url', { url: 'app://again' });

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith({ url: 'app://deep' });
    });
  });

  describe('Negative (RN throws, and that throw is the contract)', () => {
    it('rejects an empty url synchronously', () => {
      expect(() => Linking.openURL('')).toThrow('Invalid URL: cannot be empty');
    });

    it('rejects a url that is not a string synchronously', () => {
      expect(() => Reflect.apply(Linking.canOpenURL, undefined, [5])).toThrow(
        'Invalid URL: should be a string. Was: 5',
      );
    });
  });
});
