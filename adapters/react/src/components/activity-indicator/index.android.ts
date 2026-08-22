// AndroidProgressBar needs `styleAttr` (drives ProgressBar.setStyle(); missing it throws
// "setStyle() not called") and `indeterminate: true`; default color is the theme (null) —
// mirrors RN's ActivityIndicator.js android branch. Metro selects this file on an Android
// host, no Platform.OS read needed.
// device-verify-pending: confirmed by the absence of the setStyle() red box on a real host.

import { descriptorToReact } from '../../descriptor-to-react';
import { useActivityIndicatorLogic } from './shared';
import type {
  IActivityIndicatorPlatform,
  IActivityIndicatorProps,
} from './shared';
export type { IActivityIndicatorProps } from './shared';

const PLATFORM: IActivityIndicatorPlatform = {
  // RN: `color = Platform.OS === 'ios' ? GRAY : null`; Android lets the theme color it.
  defaultColor: null,
  nativeExtras: { styleAttr: 'Normal', indeterminate: true },
};

// A top-level named function, not a factory-returned closure: React Compiler's
// component detection only walks top-level declarations (see shared.ts).
export function ActivityIndicator(rawProps: IActivityIndicatorProps) {
  return descriptorToReact(useActivityIndicatorLogic(rawProps, PLATFORM));
}
