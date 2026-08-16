// Unit test for the ActionSheetIOS imperative module. A fake
// ActionSheetManager native module records the options it receives and invokes the callback
// with buttonIndex 1.
//
// ActionSheetIOS is deliberately non-throwing (like StatusBar/Alert): a missing native module
// degrades to a logged no-op on every method, never a crash. So scenarios are grouped
// "Positive" (module present, real behavior) / "no-op (native module unavailable)" rather than
// Positive/Negative — there is no throwing contract to assert against.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface ICapturedOptions {
  options: string[];
  cancelButtonIndex?: number;
  destructiveButtonIndex?: number | number[];
  destructiveButtonIndices?: number[];
}

interface ICapturedShareOptions {
  message?: string;
  url?: string;
}

let ActionSheetIOS: typeof import('./index').ActionSheetIOS;

let captured: ICapturedOptions | null;
let capturedShare: ICapturedShareOptions | null;
let dismissCalled: boolean;

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

type IFakeManager = {
  showActionSheetWithOptions?(
    options: ICapturedOptions,
    callback: (buttonIndex: number) => void,
  ): void;
  showShareActionSheetWithOptions?(
    options: ICapturedShareOptions,
    failureCallback: (error: { message: string }) => void,
    successCallback: (completed: boolean, activityType?: string) => void,
  ): void;
  dismissActionSheet?(): void;
};

function installFakeManager(manager: IFakeManager | null): void {
  globalThis.__turboModuleProxy = <T>(name: string): T | null =>
    name === 'ActionSheetManager' && manager !== null && isPresent<T>(manager) ? manager : null;
}

function defaultFakeManager(): Required<Pick<IFakeManager, 'showActionSheetWithOptions'>> &
  IFakeManager {
  return {
    showActionSheetWithOptions(
      options: ICapturedOptions,
      callback: (buttonIndex: number) => void,
    ): void {
      captured = options;
      // Simulate the user tapping row index 1.
      callback(1);
    },
    showShareActionSheetWithOptions(
      options: ICapturedShareOptions,
      _failureCallback,
      successCallback,
    ): void {
      capturedShare = options;
      successCallback(true, 'com.apple.UIKit.activity.Mail');
    },
    dismissActionSheet(): void {
      dismissCalled = true;
    },
  };
}

beforeEach(async () => {
  captured = null;
  capturedShare = null;
  dismissCalled = false;

  installFakeManager(defaultFakeManager());

  vi.resetModules();
  ({ ActionSheetIOS } = await import('./index'));
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
});

describe('ActionSheetIOS', () => {
  describe('Positive', () => {
    it('passes options through, normalizes a single destructiveButtonIndex, and delivers the chosen index', () => {
      let chosen = -1;
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['A', 'B', 'Cancel'], cancelButtonIndex: 2, destructiveButtonIndex: 1 },
        idx => {
          chosen = idx;
        },
      );

      expect(captured).not.toBeNull();
      // Options + cancelButtonIndex pass straight through to native.
      expect(captured?.options).toEqual(['A', 'B', 'Cancel']);
      expect(captured?.cancelButtonIndex).toBe(2);
      // A single destructiveButtonIndex normalizes to destructiveButtonIndices: [n].
      expect(captured?.destructiveButtonIndex).toBeUndefined();
      expect(captured?.destructiveButtonIndices).toEqual([1]);
      // The callback delivers the chosen index back to JS.
      expect(chosen).toBe(1);
    });

    // why: an already-array destructiveButtonIndex is the native-facing shape apps may pass
    // directly (multi-row destructive UI) — normalization must pass it through unchanged, not
    // just handle the legacy single-index form.
    it('an array destructiveButtonIndex passes through unchanged', () => {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['A', 'B'], destructiveButtonIndex: [0, 1] },
        () => undefined,
      );
      expect(captured?.destructiveButtonIndices).toEqual([0, 1]);
    });

    // why: when the caller supplies no destructiveButtonIndex at all, normalization must not
    // invent one — an action sheet with no destructive row must reach native with none.
    it('omitting destructiveButtonIndex leaves destructiveButtonIndices unset', () => {
      ActionSheetIOS.showActionSheetWithOptions({ options: ['A', 'B'] }, () => undefined);
      expect(captured?.destructiveButtonIndices).toBeUndefined();
    });

    it('showShareActionSheetWithOptions forwards options and delivers the success callback', () => {
      let completedResult: boolean | null = null;
      let activityTypeResult: string | undefined;
      ActionSheetIOS.showShareActionSheetWithOptions(
        { message: 'hello', url: 'https://example.com' },
        () => undefined,
        (completed, activityType) => {
          completedResult = completed;
          activityTypeResult = activityType;
        },
      );
      expect(capturedShare).toEqual({ message: 'hello', url: 'https://example.com' });
      expect(completedResult).toBe(true);
      expect(activityTypeResult).toBe('com.apple.UIKit.activity.Mail');
    });

    // why: showShareActionSheetWithOptions's contract is failure XOR success, exactly like
    // RN's own share sheet — a rejected/cancelled share must reach the failure callback, not
    // silently resolve as success.
    it('showShareActionSheetWithOptions delivers the failure callback on native error', () => {
      installFakeManager({
        showActionSheetWithOptions: defaultFakeManager().showActionSheetWithOptions,
        showShareActionSheetWithOptions(_options, failureCallback): void {
          failureCallback({ message: 'user cancelled' });
        },
      });
      let failureMessage: string | null = null;
      ActionSheetIOS.showShareActionSheetWithOptions(
        { message: 'hello' },
        error => {
          failureMessage = error.message;
        },
        () => undefined,
      );
      expect(failureMessage).toBe('user cancelled');
    });

    it('dismissActionSheet calls the native dismissActionSheet when present', () => {
      ActionSheetIOS.dismissActionSheet();
      expect(dismissCalled).toBe(true);
    });
  });

  describe('no-op (native module unavailable)', () => {
    // why: ActionSheetManager may be absent on a real device build without the module linked —
    // a missing module must degrade silently, never throw and never invoke the caller's callback.
    it('showActionSheetWithOptions is a no-op and never invokes the callback', () => {
      installFakeManager(null);
      let callbackCalled = false;
      expect(() =>
        ActionSheetIOS.showActionSheetWithOptions({ options: ['A'] }, () => {
          callbackCalled = true;
        }),
      ).not.toThrow();
      expect(callbackCalled).toBe(false);
    });

    it('showShareActionSheetWithOptions is a no-op and never invokes either callback', () => {
      installFakeManager(null);
      let anyCallbackCalled = false;
      expect(() =>
        ActionSheetIOS.showShareActionSheetWithOptions(
          { message: 'hello' },
          () => {
            anyCallbackCalled = true;
          },
          () => {
            anyCallbackCalled = true;
          },
        ),
      ).not.toThrow();
      expect(anyCallbackCalled).toBe(false);
    });

    it('dismissActionSheet is a no-op when the native module is unresolved', () => {
      installFakeManager(null);
      expect(() => ActionSheetIOS.dismissActionSheet()).not.toThrow();
    });

    // why: dismissActionSheet is declared optional on INativeActionSheetManager (older hosts may
    // lack it even when the module itself resolves) — the `?.()` call must not throw "not a
    // function" on such a host.
    it('dismissActionSheet is a no-op when the module resolves but lacks dismissActionSheet', () => {
      installFakeManager({ showActionSheetWithOptions: defaultFakeManager().showActionSheetWithOptions });
      expect(() => ActionSheetIOS.dismissActionSheet()).not.toThrow();
      expect(dismissCalled).toBe(false);
    });
  });
});
