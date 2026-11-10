// RN's `Vibration` reached through the host, on the iOS path with the native module recorded by
// vitest.config.ts. The pattern scheduler is RN's, so this proves the wiring and the throw

import { describe, expect, it } from 'vitest';
import { nativeCallsTo } from '../../../test-utils/src/native-calls';
import { Vibration } from '../react-native-host';

describe('Vibration', () => {
  describe('Positive (a buzz reaches native)', () => {
    it('buzzes for 400 ms when called without a pattern', () => {
      Vibration.vibrate();

      expect(nativeCallsTo('Vibration').at(-1)).toMatchObject({
        method: 'vibrate',
        args: [400],
      });
    });

    it('never asks native to cancel on iOS, which has no such method', () => {
      Vibration.cancel();

      expect(
        nativeCallsTo('Vibration').filter(call => call.method === 'cancel'),
      ).toEqual([]);
    });
  });

  describe('Negative (RN throws, and that throw is the contract)', () => {
    it('rejects a pattern that is neither a number nor an array', () => {
      expect(() => Reflect.apply(Vibration.vibrate, undefined, ['x'])).toThrow(
        'Vibration pattern should be a number or array',
      );
    });
  });
});
