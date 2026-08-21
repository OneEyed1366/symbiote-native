// TouchableHighlight underlay: the shared render decision (framework-agnostic). RN drives the
// highlight with setState, not Animated — while shown it paints underlayColor and lowers the child
// opacity; at rest it is the bare style (TouchableHighlight.js).

import type { IViewStyle } from '@symbiote-native/engine';
import {
  DEFAULT_HIGHLIGHT_CHILD_OPACITY,
  DEFAULT_UNDERLAY_COLOR,
} from '../state/touchable';

// RN-audited form (2026-08-19). It replaces a `highlightPressedStyle(pressed, style, …)` helper
// that folded BOTH halves onto ONE node — the bug this shape exists to prevent.
// RN keeps them apart (TouchableHighlight.js _createExtraStyles + render): `underlay` — the
// backgroundColor — goes on the container, `child` — the lowered opacity — is cloned onto the
// CHILD. Put the opacity on the container instead and it fades the very underlay it is supposed to
// reveal: `underlayColor: 'black'` paints grey, not black.
//
// So this returns the two styles SEPARATELY and takes no position on where they land. React can
// keep using cloneElement; an adapter with no element-cloning decides for itself (and records what
// it chose). Baking the one-node assumption into the shared layer is what went wrong the first time.

export interface ITouchableHighlightExtraStyles {
  // The container (the responder view): RN's `underlay`.
  underlay: IViewStyle;
  // The single child: RN's `child`.
  child: IViewStyle;
}

export interface ITouchableHighlightUnderlayView {
  // Whether the underlay is currently shown. NOT simply "pressed" — RN holds it past the tap for
  // delayPressOut (createHighlightUnderlayHandlers owns that timing).
  shown: boolean;
  // RN's _hasPressHandler gate: no press handler, no underlay.
  hasPressHandler: boolean;
  underlayColor?: string;
  activeOpacity?: number;
}

// undefined = paint nothing extra, which is RN's `extraStyles: null` state.
export function resolveHighlightExtraStyles(
  view: ITouchableHighlightUnderlayView,
): ITouchableHighlightExtraStyles | undefined {
  if (!view.shown || !view.hasPressHandler) return undefined;
  return {
    underlay: { backgroundColor: view.underlayColor ?? DEFAULT_UNDERLAY_COLOR },
    child: { opacity: view.activeOpacity ?? DEFAULT_HIGHLIGHT_CHILD_OPACITY },
  };
}
