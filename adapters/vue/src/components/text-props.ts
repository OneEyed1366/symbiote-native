// The `<text>` tag's prop surface. There is no `Text` component: the wrapper's one job beyond
// forwarding attrs was RN's `Text.js` defaults (`ellipsizeMode: 'tail'`, `allowFontScaling: true`),
// and those are seeded in the renderer's `createElement` (`seedTextDefaults`) plus re-seeded in
// `patchProp` when a value arrives as an explicit `undefined`. A `<text>` inside another `<text>`
// still commits as `RCTVirtualText`; that is the engine's commit walk, never an adapter's.

import type {
  IClassNameValue,
  IStyleProp,
  ISymbioteEvent,
  ITextStyle,
} from '@symbiote-native/engine';
import type {
  IAccessibilityProps,
  IAriaProps,
} from '@symbiote-native/components';
import type { VNodeRef } from '@vue/runtime-core';

export interface ITextProps extends IAccessibilityProps, IAriaProps {
  style?: IStyleProp<ITextStyle>;
  // See IViewProps.class — same registry, same merge precedence.
  class?: IClassNameValue;
  onPress?: (event: ISymbioteEvent) => void;
  onLongPress?: (event: ISymbioteEvent) => void;
  onPressIn?: (event: ISymbioteEvent) => void;
  onPressOut?: (event: ISymbioteEvent) => void;
  onLayout?: (event: ISymbioteEvent) => void;
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
  selectionColor?: string;
  ref?: VNodeRef;
  key?: string | number | symbol;
}
