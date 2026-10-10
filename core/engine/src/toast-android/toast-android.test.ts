// RN's Android `ToastAndroid` through the host, the native module recorded by vitest.config.ts

import { describe, expect, it } from 'vitest';
import { nativeCallsTo } from '../../../test-utils/src/native-calls';
import { ToastAndroid } from '../react-native-host';

describe('ToastAndroid', () => {
  describe('Positive (a toast reaches native)', () => {
    it('exposes the constants native reports', () => {
      expect([
        ToastAndroid.SHORT,
        ToastAndroid.LONG,
        ToastAndroid.TOP,
        ToastAndroid.BOTTOM,
        ToastAndroid.CENTER,
      ]).toEqual([0, 1, 49, 81, 17]);
    });

    it('show forwards (message, duration)', () => {
      ToastAndroid.show('hello', ToastAndroid.SHORT);

      expect(nativeCallsTo('ToastAndroid').at(-1)).toMatchObject({
        method: 'show',
        args: ['hello', ToastAndroid.SHORT],
      });
    });

    it('showWithGravity forwards all args', () => {
      ToastAndroid.showWithGravity(
        'grav',
        ToastAndroid.LONG,
        ToastAndroid.CENTER,
      );

      expect(nativeCallsTo('ToastAndroid').at(-1)).toMatchObject({
        method: 'showWithGravity',
        args: ['grav', ToastAndroid.LONG, ToastAndroid.CENTER],
      });
    });

    it('showWithGravityAndOffset forwards all args', () => {
      ToastAndroid.showWithGravityAndOffset(
        'off',
        ToastAndroid.SHORT,
        ToastAndroid.BOTTOM,
        25,
        50,
      );

      expect(nativeCallsTo('ToastAndroid').at(-1)).toMatchObject({
        method: 'showWithGravityAndOffset',
        args: ['off', ToastAndroid.SHORT, ToastAndroid.BOTTOM, 25, 50],
      });
    });
  });
});
