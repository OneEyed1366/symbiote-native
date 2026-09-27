// Shared core of the Share module, only what does NOT differ by platform: the public
// types (IShareContent / IShareOptions / IShareAction), the public contract (IShareStatic),
// and the content invariant. Share is almost entirely divergent (one method, a totally
// different native call per platform), so there is no shared factory: each platform file
// (share.ios.ts / share.android.ts) implements `share()` fully against its own module.
//
// Metro selects the platform file on a real host (share.android.ts > share.ts); the base
// share.ts re-exports the iOS build for web/headless. There is no runtime `Platform.OS`
// read: the filename is the selector.

import { invariant } from '../invariant';

export { invariant };

// RN's IShareContent: a url OR a message is required (title always optional).
export type IShareContent =
  | { title?: string; url: string; message?: string }
  | { title?: string; url?: string; message: string };

// RN's IShareOptions. `dialogTitle` is Android-only, accepted for API parity but unused
// on iOS; the rest map straight onto the iOS native share options.
export interface IShareOptions {
  dialogTitle?: string;
  subject?: string;
  excludedActivityTypes?: string[];
  tintColor?: unknown;
  anchor?: number;
}

// RN's Share action constants (RN Share.js ~173/179). These back the documented
// `result.action === Share.dismissedAction` pattern. True statically-known literals,
// so CONSTANT_CASE; the public fields (Share.sharedAction / Share.dismissedAction) are
// lowerCamel, assigned from these below.
export const SHARED_ACTION = 'sharedAction';
export const DISMISSED_ACTION = 'dismissedAction';

// RN's IShareAction: the resolved shape. The action literals must agree with the
// constants above.
// RN's own result type (`{action: string, activityType: ?string}`): the native action string
// passes through unnarrowed, so compare it against `sharedAction` / `dismissedAction`.
export interface IShareAction {
  action: string;
  activityType?: string | null;
}

// What every platform's Share exposes to app code, including the action constants both
// platform builds spread onto their Share object (so app code can compare against
// Share.dismissedAction / Share.sharedAction).
export interface IShareStatic {
  share(content: IShareContent, options?: IShareOptions): Promise<IShareAction>;
  sharedAction: typeof SHARED_ACTION;
  dismissedAction: typeof DISMISSED_ACTION;
}

// The constant fields every platform's Share exposes, spread onto the platform Share
// object so both builds carry them identically.
export const shareActions: {
  sharedAction: typeof SHARED_ACTION;
  dismissedAction: typeof DISMISSED_ACTION;
} = {
  sharedAction: SHARED_ACTION,
  dismissedAction: DISMISSED_ACTION,
};

// Share.js's three shared invariants, checked before any promise exists on both platforms.
export function assertShareArgs(
  content: IShareContent,
  options: IShareOptions,
): void {
  invariant(
    typeof content === 'object' && content !== null,
    'Content to share must be a valid object',
  );
  invariant(
    typeof content.url === 'string' || typeof content.message === 'string',
    'At least one of URL or message is required',
  );
  invariant(
    typeof options === 'object' && options !== null,
    'Options must be a valid object',
  );
}
