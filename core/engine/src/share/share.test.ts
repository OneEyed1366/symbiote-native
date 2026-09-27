// Unit test for the Share module: JS->native only. The platform builds are separate files
// (share/index.ios.ts / share/index.android.ts), imported DIRECTLY. The native module is
// platform-specific: the iOS build drives
// ActionSheetManager.showShareActionSheetWithOptions (there is NO ShareModule on iOS); the
// Android build drives ShareModule.share.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IShareContent, IShareOptions } from './index.android';

const SHARED_ACTIVITY = 'com.apple.UIKit.activity.PostToTwitter';

let iosShare: typeof import('./index.ios').Share;
let androidShare: typeof import('./index.android').Share;

// `completeNextShare` decides which iOS callback path runs; each test flips it as needed.
let completeNextShare: boolean;
let lastAndroidShare: {
  content: { title?: string; message?: string };
  dialogTitle?: string;
} | null;
let lastActionSheetOptions: Record<string, unknown> | null;
let registeredModuleNames: string[];

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

beforeEach(async () => {
  completeNextShare = true;
  lastAndroidShare = null;
  lastActionSheetOptions = null;

  const fakeActionSheetManager = {
    showShareActionSheetWithOptions: (
      options: Record<string, unknown>,
      _failureCallback: (error: { message: string }) => void,
      successCallback: (completed: boolean, activityType?: string) => void,
    ): void => {
      lastActionSheetOptions = options;
      successCallback(
        completeNextShare,
        completeNextShare ? SHARED_ACTIVITY : undefined,
      );
    },
  };

  const fakeShareModule = {
    share: (
      content: { title?: string; message?: string },
      dialogTitle?: string,
    ): Promise<{ action: string }> => {
      lastAndroidShare = { content, dialogTitle };
      return Promise.resolve({ action: 'sharedAction' });
    },
  };

  const registeredModules: Record<string, unknown> = {
    ActionSheetManager: fakeActionSheetManager,
    ShareModule: fakeShareModule,
  };

  registeredModuleNames = [];
  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    registeredModuleNames.push(name);
    const module = registeredModules[name];
    return isPresent<T>(module) ? module : null;
  };

  vi.resetModules();
  ({ Share: iosShare } = await import('./index.ios'));
  ({ Share: androidShare } = await import('./index.android'));
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
});

describe('Share action constants', () => {
  it('both builds expose dismissedAction / sharedAction', () => {
    expect(iosShare.dismissedAction).toBe('dismissedAction');
    expect(iosShare.sharedAction).toBe('sharedAction');
    expect(androidShare.dismissedAction).toBe('dismissedAction');
    expect(androidShare.sharedAction).toBe('sharedAction');
  });
});

describe('content validation — shared across both platforms', () => {
  // why: the throw IS the contract (validateContent's whole job) — a Negative test must
  // assert the SPECIFIC message, not just "it rejected something".
  // RN checks these with `invariant` BEFORE any promise exists (Share.js), so they throw
  // synchronously on both platforms rather than rejecting.
  it('content with neither message nor url throws the exact validation message', () => {
    // JSON.parse yields an untyped value so the deliberately-invalid shape needs no cast.
    const invalidContent: IShareContent = JSON.parse(
      '{"title":"only a title"}',
    );
    expect(() => iosShare.share(invalidContent)).toThrow(
      'At least one of URL or message is required',
    );
    expect(() => androidShare.share(invalidContent)).toThrow(
      'At least one of URL or message is required',
    );
  });

  // why: the non-object guard is a distinct branch from the missing-url/message guard.
  it('null content throws "must be a valid object"', () => {
    const nullContent: IShareContent = JSON.parse('null');
    expect(() => iosShare.share(nullContent)).toThrow(
      'Content to share must be a valid object',
    );
    expect(() => androidShare.share(nullContent)).toThrow(
      'Content to share must be a valid object',
    );
  });

  // why: RN's third invariant — options must be an object (a caller passing null breaks it).
  it('null options throw "Options must be a valid object"', () => {
    const nullOptions: IShareOptions = JSON.parse('null');
    expect(() => iosShare.share({ message: 'hi' }, nullOptions)).toThrow(
      'Options must be a valid object',
    );
    expect(() => androidShare.share({ message: 'hi' }, nullOptions)).toThrow(
      'Options must be a valid object',
    );
  });
});

describe('Share (iOS build -> ActionSheetManager)', () => {
  it('a completed share resolves { action: sharedAction, activityType }', async () => {
    completeNextShare = true;
    const shared = await iosShare.share({ message: 'hi', url: 'https://x' });
    expect(shared.action).toBe('sharedAction');
    expect(shared.activityType).toBe(SHARED_ACTIVITY);
  });

  it('a dismissed share resolves dismissedAction', async () => {
    completeNextShare = false;
    const dismissed = await iosShare.share({ message: 'hi' });
    expect(dismissed.action).toBe('dismissedAction');
    expect(dismissed.activityType).toBeNull();
  });

  // why: showShareActionSheetWithOptions's FAILURE callback path (a native share-sheet
  // error) was previously untested — only the success path was — and must reject, not hang
  // or resolve, with the native error's own message.
  it('a native failure callback rejects with the native error itself', async () => {
    const nativeError = { message: 'user cancelled' };
    globalThis.__turboModuleProxy = <T>(name: string): T | null => {
      if (name !== 'ActionSheetManager') return null;
      const failingManager = {
        showShareActionSheetWithOptions: (
          _options: Record<string, unknown>,
          failureCallback: (error: { message: string }) => void,
        ): void => {
          failureCallback(nativeError);
        },
      };
      return isPresent<T>(failingManager) ? failingManager : null;
    };
    vi.resetModules();
    const fresh = await import('./index.ios');

    // why: RN passes it straight through (`error => reject(error)`), no re-wrapping.
    await expect(fresh.Share.share({ message: 'hi' })).rejects.toBe(
      nativeError,
    );
  });

  // why: RN's invariant runs INSIDE the promise executor on iOS, so it rejects (not throws)
  // with RN's own message.
  it('rejects with RN’s message when ActionSheetManager is not resolvable', async () => {
    globalThis.__turboModuleProxy = <T>(_name: string): T | null => null;
    vi.resetModules();
    const fresh = await import('./index.ios');

    await expect(fresh.Share.share({ message: 'hi' })).rejects.toThrow(
      'NativeActionSheetManager is not registered on iOS, but it should be.',
    );
  });

  // why: RN runs options.tintColor through processColor and sends only a number; anything
  // else is an invariant failure inside the executor (a rejection).
  it('sends a processed tintColor and rejects one that does not process to a number', async () => {
    const { setColorProcessor } = await import('../platform-color');
    // RN's processColor: a CSS string becomes an int, an opaque PlatformColor stays an object.
    setColorProcessor(value => (value === '#ff0000' ? 0xff_ff_00_00 : value));
    try {
      await iosShare.share({ message: 'hi' }, { tintColor: '#ff0000' });
      expect(lastActionSheetOptions?.tintColor).toBe(0xff_ff_00_00);

      await expect(
        iosShare.share(
          { message: 'hi' },
          { tintColor: { semantic: ['systemBlue'] } },
        ),
      ).rejects.toThrow('Unexpected color given for options.tintColor');
    } finally {
      setColorProcessor(value => value);
    }
  });

  // Regression net for the action-sheet-ios/share contract merge: Share must keep resolving
  // through the exact SAME native module name that action-sheet-ios owns, and must still
  // invoke showShareActionSheetWithOptions with the options Share builds - proving the merged
  // INativeActionSheetManager type (imported from ../action-sheet-ios) didn't change behavior.
  it('resolves through the ActionSheetManager module and invokes showShareActionSheetWithOptions with the built options', async () => {
    await iosShare.share(
      { message: 'hi', url: 'https://x' },
      { subject: 'subj' },
    );

    expect(registeredModuleNames).toContain('ActionSheetManager');
    expect(lastActionSheetOptions).not.toBeNull();
    expect(lastActionSheetOptions?.message).toBe('hi');
    expect(lastActionSheetOptions?.url).toBe('https://x');
    expect(lastActionSheetOptions?.subject).toBe('subj');
  });
});

describe('Share (Android build -> ShareModule)', () => {
  it('forwards content + dialogTitle and maps the result to activityType: null', async () => {
    const androidResult = await androidShare.share(
      { title: 'T', message: 'body' },
      { dialogTitle: 'Pick one' },
    );
    expect(androidResult.action).toBe('sharedAction');
    expect(androidResult.activityType).toBeNull();
    expect(lastAndroidShare).not.toBeNull();
    expect(lastAndroidShare?.content.message).toBe('body');
    expect(lastAndroidShare?.content.title).toBe('T');
    expect(lastAndroidShare?.dialogTitle).toBe('Pick one');
  });

  // why: Android has no dismiss signal from the OS — a native result reporting the literal
  // 'dismissedAction' string must still map through, or the app could never observe a
  // dismissal on Android.
  it('maps a native dismissedAction result to dismissedAction', async () => {
    globalThis.__turboModuleProxy = <T>(name: string): T | null => {
      if (name !== 'ShareModule') return null;
      const dismissingModule = {
        share: (): Promise<{ action: string }> =>
          Promise.resolve({ action: 'dismissedAction' }),
      };
      return isPresent<T>(dismissingModule) ? dismissingModule : null;
    };
    vi.resetModules();
    const fresh = await import('./index.android');

    const result = await fresh.Share.share({ message: 'hi' });
    expect(result.action).toBe('dismissedAction');
  });

  // why: RN resolves `{activityType: null, ...result}` — the native result passes through
  // untouched, extra fields included; it does not police its shape.
  it('passes the native result through under activityType null', async () => {
    globalThis.__turboModuleProxy = <T>(name: string): T | null => {
      if (name !== 'ShareModule') return null;
      const extraFieldModule = {
        share: (): Promise<unknown> =>
          Promise.resolve({ action: 'sharedAction', extra: 'x' }),
      };
      return isPresent<T>(extraFieldModule) ? extraFieldModule : null;
    };
    vi.resetModules();
    const fresh = await import('./index.android');

    await expect(fresh.Share.share({ message: 'hi' })).resolves.toEqual({
      activityType: null,
      action: 'sharedAction',
      extra: 'x',
    });
  });

  // why: RN's Android-only invariant: a title must be a string when present.
  it('throws synchronously for a non-string title', () => {
    const numericTitle: IShareContent = JSON.parse(
      '{"title":7,"message":"hi"}',
    );
    expect(() => androidShare.share(numericTitle)).toThrow(
      'Invalid title: title should be a string.',
    );
  });

  // why: RN's `invariant(NativeShareModule, …)` on Android runs before any promise exists.
  it('throws synchronously when ShareModule is not resolvable', async () => {
    globalThis.__turboModuleProxy = <T>(_name: string): T | null => null;
    vi.resetModules();
    const fresh = await import('./index.android');

    expect(() => fresh.Share.share({ message: 'hi' })).toThrow(
      'ShareModule should be registered on Android.',
    );
  });
});
