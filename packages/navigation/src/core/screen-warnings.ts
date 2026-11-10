// Dev warnings of react-native-screens about option combinations that misbehave

import { STACK_DEFAULT_PRESENTATION } from './constants';
import type { IScreenOptions, IScrollEdgeEffects } from './navigator-props';
import { warnOnce } from './warn-once';

const BLUR_WITH_EDGE_EFFECTS_MESSAGE =
  '[RNScreens] Using both `blurEffect` and `scrollEdgeEffects` simultaneously may cause overlapping effects.';
const HEADER_TOGGLE_IN_MODAL_MESSAGE =
  "Dynamically changing header's visibility in modals will result in remounting the screen and losing all local state.";

const NO_BLUR_EFFECT = 'none';
const HIDDEN_EDGE_EFFECT = 'hidden';
const HEADER_HIDDEN_SUFFIX = ':header-hidden';
const HEADER_SHOWN_SUFFIX = ':header-shown';

export type IScreenWarningsInput = {
  options: IScreenOptions;
  routeKey: string;
  isAndroid: boolean;
  isIOS26OrHigher: boolean;
  // Survives between renders of one route, it remembers the header visibility of the last one
  seenKeys: Set<string>;
};

function hasVisibleEdgeEffects(effects: IScrollEdgeEffects | undefined) {
  return (
    effects === undefined ||
    Object.values(effects).some(effect => effect !== HIDDEN_EDGE_EFFECT)
  );
}

// Reads and rewrites the remembered visibility, so true means it flipped since the last render
function hasHeaderVisibilityFlipped(
  input: IScreenWarningsInput,
  isHidden: boolean,
): boolean {
  const hiddenKey = input.routeKey + HEADER_HIDDEN_SUFFIX;
  const shownKey = input.routeKey + HEADER_SHOWN_SUFFIX;
  const [currentKey, previousKey] = isHidden
    ? [hiddenKey, shownKey]
    : [shownKey, hiddenKey];
  const hasFlipped = input.seenKeys.delete(previousKey);
  input.seenKeys.add(currentKey);
  return hasFlipped;
}

export function warnOnScreenOptions(input: IScreenWarningsInput): void {
  const { options } = input;
  const hasBlurEffect =
    options.headerBlurEffect !== undefined &&
    options.headerBlurEffect !== NO_BLUR_EFFECT;
  warnOnce(
    input.isIOS26OrHigher &&
      hasBlurEffect &&
      hasVisibleEdgeEffects(options.scrollEdgeEffects),
    BLUR_WITH_EDGE_EFFECTS_MESSAGE,
  );
  const hasFlipped = hasHeaderVisibilityFlipped(
    input,
    options.headerShown === false,
  );
  const isModalPresentation =
    (options.stackPresentation ?? STACK_DEFAULT_PRESENTATION) !==
    STACK_DEFAULT_PRESENTATION;
  warnOnce(
    !input.isAndroid && isModalPresentation && hasFlipped,
    HEADER_TOGGLE_IN_MODAL_MESSAGE,
  );
}
