// Share (Android build). The native module is `ShareModule`:
// `share(content, dialogTitle?) -> Promise<{ action }>`. We validate content, build the
// content dict (title/message), forward the dialog title, and map the resolved action
// onto the shared IShareAction shape; Android has no dismiss path, so RN fills the
// missing activityType with null. Metro picks this file on an Android host.
//
// device-verify-pending: the `ShareModule` name matches NativeShareModule's
// TurboModuleRegistry.get('ShareModule') from RN source, but headless fakes resolve any
// name, so it is only proven on a real Android host (a bridgeless resolution log there).

import { dlog } from '../debug';
import { getNativeModule } from '../native-modules';
import { assertShareArgs, invariant, shareActions } from './shared';
import type {
  IShareContent,
  IShareOptions,
  IShareAction,
  IShareStatic,
} from './shared';

export type { IShareContent, IShareOptions, IShareAction } from './shared';

const SHARE_MODULE = 'ShareModule';

// The Android ShareModule contract, from NativeShareModule's spec: share takes a content
// dict (title/message) plus the dialog title and resolves { action }. Single trust-
// boundary point (no per-call `as`; the generic on getNativeModule carries it).
interface IShareModuleAndroid {
  share(
    content: { title?: string; message?: string },
    dialogTitle?: string,
  ): Promise<{ action: string }>;
}

export const Share: IShareStatic = {
  ...shareActions,
  // Share.js's Android branch: every check is a synchronous invariant, and the native result
  // passes through untouched under `activityType: null`.
  share(
    content: IShareContent,
    options: IShareOptions = {},
  ): Promise<IShareAction> {
    assertShareArgs(content, options);
    dlog('Share.share (android)');
    const shareModule = getNativeModule<IShareModuleAndroid>(SHARE_MODULE);
    invariant(
      shareModule !== null,
      'ShareModule should be registered on Android.',
    );
    invariant(
      content.title == null || typeof content.title === 'string',
      'Invalid title: title should be a string.',
    );
    const newContent = {
      title: content.title,
      message:
        typeof content.message === 'string' ? content.message : undefined,
    };
    return shareModule
      .share(newContent, options.dialogTitle)
      .then(result => ({ activityType: null, ...result }));
  },
};
