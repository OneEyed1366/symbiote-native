// Share, iOS build. The native module is `ActionSheetManager` (there is NO ShareModule
// on iOS; that is the Android module); the share sheet is driven by its callback-style
// `showShareActionSheetWithOptions(options, failure, success)`. We validate content, map
// options onto the native share options, and resolve the IShareAction from the success
// callback. Metro picks this file on an iOS host; the base share.ts re-exports it for
// web/headless.

import { dlog } from '../debug';
import { getNativeModule } from '../native-modules';
import {
  ACTION_SHEET_MANAGER,
  type INativeActionSheetManager,
  type IShareActionSheetIOSOptions,
  type IShareActionSheetError,
} from '../action-sheet-ios';
import { isProcessableColor, processColor } from '../platform-color';
import {
  assertShareArgs,
  invariant,
  shareActions,
  SHARED_ACTION,
  DISMISSED_ACTION,
} from './shared';
import type {
  IShareContent,
  IShareOptions,
  IShareAction,
  IShareStatic,
} from './shared';

export type { IShareContent, IShareOptions, IShareAction } from './shared';

export const Share: IShareStatic = {
  ...shareActions,
  // Open the iOS share sheet for `content`. Resolves with the user's action
  // (sharedAction / dismissedAction); rejects on invalid content, a native failure,
  // or a missing module (explicit reject rather than a Promise that never settles).
  share(
    content: IShareContent,
    options: IShareOptions = {},
  ): Promise<IShareAction> {
    assertShareArgs(content, options);
    dlog('Share.share (ios)');
    // Share.js's iOS branch: both invariants run INSIDE the executor, so they reject.
    return new Promise((resolve, reject) => {
      const tintColor = isProcessableColor(options.tintColor)
        ? processColor(options.tintColor)
        : undefined;
      invariant(
        tintColor == null || typeof tintColor === 'number',
        'Unexpected color given for options.tintColor',
      );
      const manager =
        getNativeModule<INativeActionSheetManager>(ACTION_SHEET_MANAGER);
      invariant(
        manager !== null,
        'NativeActionSheetManager is not registered on iOS, but it should be.',
      );
      manager.showShareActionSheetWithOptions(
        {
          message:
            typeof content.message === 'string' ? content.message : undefined,
          url: typeof content.url === 'string' ? content.url : undefined,
          subject: options.subject,
          tintColor: typeof tintColor === 'number' ? tintColor : undefined,
          anchor:
            typeof options.anchor === 'number' ? options.anchor : undefined,
          excludedActivityTypes: options.excludedActivityTypes,
        },
        error => {
          dlog('Share.share -> failure');
          reject(error);
        },
        (completed, activityType) => {
          dlog(`Share.share -> success completed=${completed}`);
          resolve(
            completed
              ? { action: SHARED_ACTION, activityType }
              : { action: DISMISSED_ACTION, activityType: null },
          );
        },
      );
    });
  },
};
