// Unit test for the Share module: JS->native only. The platform builds are separate files
// (share/index.ios.ts / share/index.android.ts), imported DIRECTLY. The native module is
// platform-specific: the iOS build drives
// ActionSheetManager.showShareActionSheetWithOptions (there is NO ShareModule on iOS); the
// Android build drives ShareModule.share.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IShareContent } from './index.android';

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
      successCallback(completeNextShare, completeNextShare ? SHARED_ACTIVITY : undefined);
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
  it('content with neither message nor url rejects with the exact validation message', async () => {
    // JSON.parse yields an untyped value so the deliberately-invalid shape needs no cast.
    const invalidContent: IShareContent = JSON.parse('{"title":"only a title"}');
    await expect(iosShare.share(invalidContent)).rejects.toThrow(
      'At least one of URL or message is required',
    );
  });

  // why: validateContent's FIRST guard (non-object content) is a distinct branch from the
  // missing-url/message guard — both must be provably reachable, not just one of the two.
  it('null content rejects with "must be a valid object"', async () => {
    const nullContent: IShareContent = JSON.parse('null');
    await expect(iosShare.share(nullContent)).rejects.toThrow(
      'Content to share must be a valid object',
    );
    await expect(androidShare.share(nullContent)).rejects.toThrow(
      'Content to share must be a valid object',
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
  it('a native failure callback rejects with the native error message', async () => {
    globalThis.__turboModuleProxy = <T>(name: string): T | null => {
      if (name !== 'ActionSheetManager') return null;
      const failingManager = {
        showShareActionSheetWithOptions: (
          _options: Record<string, unknown>,
          failureCallback: (error: { message: string }) => void,
        ): void => {
          failureCallback({ message: 'user cancelled' });
        },
      };
      return isPresent<T>(failingManager) ? failingManager : null;
    };
    vi.resetModules();
    const fresh = await import('./index.ios');

    await expect(fresh.Share.share({ message: 'hi' })).rejects.toThrow('user cancelled');
  });

  // why: a device without ActionSheetManager linked (unlikely on iOS, but the module is
  // resolved lazily and defensively) must reject explicitly rather than return a Promise
  // that never settles.
  it('rejects with a specific message when ActionSheetManager is not resolvable', async () => {
    globalThis.__turboModuleProxy = <T>(_name: string): T | null => null;
    vi.resetModules();
    const fresh = await import('./index.ios');

    await expect(fresh.Share.share({ message: 'hi' })).rejects.toThrow(
      'Share: ActionSheetManager native module unavailable',
    );
  });

  // Regression net for the action-sheet-ios/share contract merge: Share must keep resolving
  // through the exact SAME native module name that action-sheet-ios owns, and must still
  // invoke showShareActionSheetWithOptions with the options Share builds - proving the merged
  // INativeActionSheetManager type (imported from ../action-sheet-ios) didn't change behavior.
  it('resolves through the ActionSheetManager module and invokes showShareActionSheetWithOptions with the built options', async () => {
    await iosShare.share({ message: 'hi', url: 'https://x' }, { subject: 'subj' });

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
        share: (): Promise<{ action: string }> => Promise.resolve({ action: 'dismissedAction' }),
      };
      return isPresent<T>(dismissingModule) ? dismissingModule : null;
    };
    vi.resetModules();
    const fresh = await import('./index.android');

    const result = await fresh.Share.share({ message: 'hi' });
    expect(result.action).toBe('dismissedAction');
  });

  // why: `isShareResult` narrows an untyped native return value — a result missing a string
  // `action` is exactly the malformed-payload case the guard exists to catch, and must
  // reject with a specific message rather than crash on `result.action`.
  it('rejects with a specific message when the native result is missing a string action', async () => {
    globalThis.__turboModuleProxy = <T>(name: string): T | null => {
      if (name !== 'ShareModule') return null;
      const malformedModule = {
        share: (): Promise<unknown> => Promise.resolve({ notAction: true }),
      };
      return isPresent<T>(malformedModule) ? malformedModule : null;
    };
    vi.resetModules();
    const fresh = await import('./index.android');

    await expect(fresh.Share.share({ message: 'hi' })).rejects.toThrow(
      'Share: ShareModule returned an unexpected result',
    );
  });

  it('rejects with a specific message when ShareModule is not resolvable', async () => {
    globalThis.__turboModuleProxy = <T>(_name: string): T | null => null;
    vi.resetModules();
    const fresh = await import('./index.android');

    await expect(fresh.Share.share({ message: 'hi' })).rejects.toThrow(
      'Share: ShareModule native module unavailable',
    );
  });
});
