// `FullWindowOverlay` of react-native-screens: a native window above the app, iOS only
// Core picks the native view and its props, an adapter renders the children inside it

import { RNS_FULL_WINDOW_OVERLAY_VIEW_NAME } from './constants';
import { warnOnce } from './warn-once';

export type IFullWindowOverlayProps = {
  unstable_accessibilityContainerViewIsModal?: boolean;
};

export type IFullWindowOverlayInput = IFullWindowOverlayProps & {
  isIOS: boolean;
  width: number;
  height: number;
};

export type IFullWindowOverlay = {
  viewName: string;
  props: Record<string, unknown>;
};

const ABSOLUTE_FILL = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

const PLAIN_VIEW_NAME = 'view';
const NOT_IOS_MESSAGE = 'Using FullWindowOverlay is only valid on iOS devices.';

// The overlay window is not sized by its parent, so it takes the window size explicitly
// Off iOS there is no overlay window and the children sit in a plain view
export function resolveFullWindowOverlay(
  input: IFullWindowOverlayInput,
): IFullWindowOverlay {
  warnOnce(!input.isIOS, NOT_IOS_MESSAGE);
  if (!input.isIOS) return { viewName: PLAIN_VIEW_NAME, props: {} };
  return {
    viewName: RNS_FULL_WINDOW_OVERLAY_VIEW_NAME,
    props: {
      style: [ABSOLUTE_FILL, { width: input.width, height: input.height }],
      accessibilityContainerViewIsModal:
        input.unstable_accessibilityContainerViewIsModal,
    },
  };
}
