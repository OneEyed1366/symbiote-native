// RN's `ActionSheetIOS` through the host, ActionSheetManager recorded by vitest.config.ts
// NOTE: "native module missing" is not reachable here, the stub always registers the module

import { describe, expect, it } from 'vitest';
import { nativeCallsTo } from '../../../test-utils/src/native-calls';
import { ActionSheetIOS } from '../react-native-host';

function lastCall(method: string): unknown[] {
  const call = nativeCallsTo('ActionSheetManager').findLast(
    entry => entry.method === method,
  );
  return call?.args ?? [];
}

function callbackAt(method: string, index: number) {
  const callback = lastCall(method)[index];
  if (typeof callback !== 'function') throw new Error('no native callback');
  return (...args: unknown[]) => Reflect.apply(callback, undefined, args);
}

describe('ActionSheetIOS', () => {
  describe('Positive', () => {
    it('normalizes a single destructiveButtonIndex into destructiveButtonIndices', () => {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['A', 'B', 'Cancel'],
          cancelButtonIndex: 2,
          destructiveButtonIndex: 1,
        },
        () => undefined,
      );

      expect(lastCall('showActionSheetWithOptions')[0]).toMatchObject({
        options: ['A', 'B', 'Cancel'],
        cancelButtonIndex: 2,
        destructiveButtonIndices: [1],
      });
    });

    it('sends null destructiveButtonIndices when none is given', () => {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['A'] },
        () => undefined,
      );

      expect(lastCall('showActionSheetWithOptions')[0]).toMatchObject({
        destructiveButtonIndices: null,
      });
    });

    it('delivers the chosen index to the callback', () => {
      let chosen = -1;
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['A', 'B'] },
        index => {
          chosen = index;
        },
      );
      callbackAt('showActionSheetWithOptions', 1)(1);

      expect(chosen).toBe(1);
    });

    it('sends tint colors to native as numbers', () => {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['A'],
          tintColor: '#ff0000',
          cancelButtonTintColor: '#ff0000',
        },
        () => undefined,
      );

      expect(lastCall('showActionSheetWithOptions')[0]).toMatchObject({
        tintColor: expect.any(Number),
        cancelButtonTintColor: expect.any(Number),
      });
    });

    it('showShareActionSheetWithOptions forwards options and the success callback', () => {
      let result: [boolean, string | undefined] | null = null;
      ActionSheetIOS.showShareActionSheetWithOptions(
        { message: 'hello', url: 'https://example.com' },
        () => undefined,
        (completed, activityType) => {
          result = [completed, activityType];
        },
      );
      callbackAt('showShareActionSheetWithOptions', 2)(
        true,
        'com.apple.UIKit.activity.Mail',
      );

      expect(lastCall('showShareActionSheetWithOptions')[0]).toMatchObject({
        message: 'hello',
        url: 'https://example.com',
      });
      expect(result).toEqual([true, 'com.apple.UIKit.activity.Mail']);
    });

    it('showShareActionSheetWithOptions delivers the native failure', () => {
      let failure: string | null = null;
      ActionSheetIOS.showShareActionSheetWithOptions(
        { message: 'hello' },
        error => {
          failure = error.message;
        },
        () => undefined,
      );
      callbackAt(
        'showShareActionSheetWithOptions',
        1,
      )({ message: 'user cancelled' });

      expect(failure).toBe('user cancelled');
    });

    it('dismissActionSheet reaches native', () => {
      ActionSheetIOS.dismissActionSheet();

      expect(nativeCallsTo('ActionSheetManager').at(-1)?.method).toBe(
        'dismissActionSheet',
      );
    });
  });

  describe('Negative (RN throws, and that throw is the contract)', () => {
    const notAnObject: unknown = JSON.parse('5');
    const notAFunction: unknown = JSON.parse('"x"');

    it('showActionSheetWithOptions needs an options object', () => {
      expect(() =>
        Reflect.apply(ActionSheetIOS.showActionSheetWithOptions, undefined, [
          notAnObject,
          () => undefined,
        ]),
      ).toThrow('Options must be a valid object');
    });

    it('showActionSheetWithOptions needs a callback', () => {
      expect(() =>
        Reflect.apply(ActionSheetIOS.showActionSheetWithOptions, undefined, [
          { options: ['A'] },
          notAFunction,
        ]),
      ).toThrow('Must provide a valid callback');
    });

    it('showShareActionSheetWithOptions needs options and both callbacks', () => {
      const share = ActionSheetIOS.showShareActionSheetWithOptions;
      const noop = () => undefined;
      expect(() =>
        Reflect.apply(share, undefined, [notAnObject, noop, noop]),
      ).toThrow('Options must be a valid object');
      expect(() =>
        Reflect.apply(share, undefined, [{}, notAFunction, noop]),
      ).toThrow('Must provide a valid failureCallback');
      expect(() =>
        Reflect.apply(share, undefined, [{}, noop, notAFunction]),
      ).toThrow('Must provide a valid successCallback');
    });
  });
});
