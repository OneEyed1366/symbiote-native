// The `<text>` tag's prop surface. Same story as `./view-props.ts` — the wrapper forwarded a bag
// and its two folds live below the adapter now, with one addition: RN's `Text` DEFAULTS
// (`ellipsizeMode`, `allowFontScaling`) are seeded by the renderer at `createElement` and re-seeded
// on a patch that clears them, so a bare tag carries them exactly as the component did.
//
// THE NESTING (`RCTText` vs `RCTVirtualText`) was never this file's job and still is not. React
// Native tracks a TextAncestor context so a Text inside another Text renders as a virtual span;
// here the engine's commit walk carries `hasTextAncestor` down and picks the view name itself
// (`viewNameFor`, core/engine/src/commit.ts), re-creating the node when the kind flips. Every
// adapter emits the same flat `text` and the engine resolves it for all of them.

import type { Ref } from 'solid-js';
import type { JSX } from '../jsx-runtime';
import type {
  IAccessibilityProps,
  IAriaProps,
} from '@symbiote-native/components';
import type {
  IClassNameValue,
  IStyleProp,
  ISymbioteEvent,
  ITextStyle,
} from '@symbiote-native/engine';
import type { IHostInstance } from '../host-instance';

// Per-adapter for the same reason IViewProps is (children + ref are framework values); the
// agnostic field base is shared. No IResponderProps here, matching every other adapter's
// ITextProps, and no `id` — RN's Text has never carried the W3C alias.
export interface ITextProps extends IAccessibilityProps, IAriaProps {
  style?: IStyleProp<ITextStyle>;
  // See IViewProps.class — same registry, same merge precedence.
  class?: IClassNameValue;
  onPress?: (event: ISymbioteEvent) => void;
  // Synthesized from a long touch hold by the engine's events layer (a hold timer armed on touch
  // start, fired after 500ms, suppressing the tap on release), like RN's Text.
  onLongPress?: (event: ISymbioteEvent) => void;
  // Touch lifecycle around a press, synthesized from the touch stream.
  onPressIn?: (event: ISymbioteEvent) => void;
  onPressOut?: (event: ISymbioteEvent) => void;
  // The view-frame layout event, distinct from onTextLayout's per-glyph frames; a listener raises
  // the onLayout flag prop so native measures.
  onLayout?: (event: ISymbioteEvent) => void;
  // Fires after glyph layout with per-line frames, wired as a direct event (RCTText).
  onTextLayout?: (event: ISymbioteEvent) => void;
  numberOfLines?: number;
  ellipsizeMode?: 'head' | 'middle' | 'tail' | 'clip';
  selectable?: boolean;
  // RN's Text carries it (Text.js) and Button hands it to the label so a screen reader announces
  // the text as disabled along with the button holding it (Button.js:388).
  disabled?: boolean;
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
  allowFontScaling?: boolean;
  maxFontSizeMultiplier?: number | null;
  // A color prop: the engine's commit layer runs selectionColor through the platform color
  // processor (commit.ts COLOR_PROPS), so it reaches Fabric correctly.
  selectionColor?: string;
  ref?: Ref<IHostInstance>;
  children?: JSX.Element;
}
