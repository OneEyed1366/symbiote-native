// RN's `Share` through the host on the iOS path, ActionSheetManager recorded by vitest.config.ts
// NOTE: the Android path (`ShareModule`) is not reachable headless, Platform is pinned to iOS

import { describe, expect, it } from 'vitest';
import { nativeCallsTo } from '../../../test-utils/src/native-calls';
import { Share } from '../react-native-host';
import type { IShareContent } from './index';

function lastShareSheetArgs(): unknown[] {
  const call = nativeCallsTo('ActionSheetManager').findLast(
    entry => entry.method === 'showShareActionSheetWithOptions',
  );
  return call?.args ?? [];
}

function callbackAt(index: number): (...args: unknown[]) => void {
  const callback = lastShareSheetArgs()[index];
  if (typeof callback !== 'function') throw new Error('no native callback');
  return (...args) => Reflect.apply(callback, undefined, args);
}

describe('Share', () => {
  describe('Positive (the share sheet reaches native)', () => {
    it('exposes the action constants to compare a result against', () => {
      expect(Share.sharedAction).toBe('sharedAction');
      expect(Share.dismissedAction).toBe('dismissedAction');
    });

    it('hands message, url and subject to ActionSheetManager', () => {
      void Share.share(
        { message: 'hi', url: 'https://x' },
        { subject: 'subj' },
      );

      expect(lastShareSheetArgs()[0]).toMatchObject({
        message: 'hi',
        url: 'https://x',
        subject: 'subj',
      });
    });

    it('resolves sharedAction with the activity type once native completes', async () => {
      const pending = Share.share({ message: 'hi' });
      callbackAt(2)(true, 'com.apple.UIKit.activity.PostToTwitter');

      await expect(pending).resolves.toEqual({
        action: 'sharedAction',
        activityType: 'com.apple.UIKit.activity.PostToTwitter',
      });
    });

    it('resolves dismissedAction when the sheet is dismissed', async () => {
      const pending = Share.share({ message: 'hi' });
      callbackAt(2)(false);

      await expect(pending).resolves.toMatchObject({
        action: 'dismissedAction',
      });
    });
  });

  describe('Negative (RN throws, and that throw is the contract)', () => {
    it('throws when there is neither a message nor a url', () => {
      const titleOnly: IShareContent = JSON.parse('{"title":"only a title"}');

      expect(() => Share.share(titleOnly)).toThrow(
        'At least one of URL or message is required',
      );
    });

    it('throws for null content', () => {
      const nullContent: IShareContent = JSON.parse('null');

      expect(() => Share.share(nullContent)).toThrow(
        'Content to share must be a valid object',
      );
    });

    it('rejects with the native error when the share sheet fails', async () => {
      const nativeError = { message: 'user cancelled' };
      const pending = Share.share({ message: 'hi' });
      callbackAt(1)(nativeError);

      await expect(pending).rejects.toBe(nativeError);
    });
  });
});
