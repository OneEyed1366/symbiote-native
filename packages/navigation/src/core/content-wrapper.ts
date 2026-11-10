// The view around a screen's content: its positioning and the app's `contentStyle` over it
// Mirrors the screens `getPositioningStyle` and `extractScreenStyles`

import { flattenStyle } from '@symbiote-native/engine';
import { STACK_FORM_SHEET_PRESENTATION } from './constants';
import type {
  IScreenOptions,
  ISheetAllowedDetents,
  IStackPresentation,
} from './navigator-props';
import { featureFlags } from './screens-config';

const FILL_STYLE = { flex: 1 };

// No `bottom`, so the sheet is sized by its content and Yoga does not resize it during animations
const SHEET_FROM_CONTENT_STYLE = {
  position: 'absolute',
  top: 0,
  start: 0,
  end: 0,
};

// `headerTranslucent` removes the offset Android's native header gives the content, so an opaque
// custom header that relies on `SafeAreaView` would clip its first 56dp
const ANDROID_HEADER_TOOLBAR_HEIGHT = 56;

export type IContentWrapperInput = {
  stackPresentation: IStackPresentation | undefined;
  headerHidden: boolean;
  headerTranslucent: boolean | undefined;
  isAndroid: boolean;
  sheetAllowedDetents: ISheetAllowedDetents | undefined;
  contentStyle: IScreenOptions['contentStyle'];
};

export type IContentWrapper = {
  style: Record<string, unknown>;
  // Goes onto the screen itself, so it paints under the bottom safe area inset of an iOS sheet
  screenStyle: Record<string, unknown> | undefined;
};

function resolvePositioningStyle(
  input: IContentWrapperInput,
): Record<string, unknown> {
  if (input.stackPresentation !== STACK_FORM_SHEET_PRESENTATION) {
    return FILL_STYLE;
  }
  const isFitToContents = input.sheetAllowedDetents === 'fitToContents';
  if (input.isAndroid) {
    return isFitToContents ? SHEET_FROM_CONTENT_STYLE : FILL_STYLE;
  }
  const isSizedNatively =
    !isFitToContents && featureFlags.experiment.synchronousScreenUpdatesEnabled;
  return isSizedNatively ? FILL_STYLE : SHEET_FROM_CONTENT_STYLE;
}

function resolveToolbarOffset(
  input: IContentWrapperInput,
): Record<string, unknown> {
  const isToolbarOverlaid =
    input.isAndroid && !input.headerHidden && input.headerTranslucent === true;
  return isToolbarOverlaid ? { paddingTop: ANDROID_HEADER_TOOLBAR_HEIGHT } : {};
}

export function resolveContentWrapper(
  input: IContentWrapperInput,
): IContentWrapper {
  const { backgroundColor, ...appStyle } = flattenStyle(input.contentStyle);
  const isIosSheet =
    input.stackPresentation === STACK_FORM_SHEET_PRESENTATION &&
    !input.isAndroid;
  const hasScreenBackground = isIosSheet && backgroundColor !== undefined;
  const wrapperStyle = hasScreenBackground
    ? appStyle
    : { ...appStyle, backgroundColor };
  return {
    style: {
      ...resolvePositioningStyle(input),
      ...resolveToolbarOffset(input),
      ...wrapperStyle,
    },
    screenStyle: hasScreenBackground ? { backgroundColor } : undefined,
  };
}
