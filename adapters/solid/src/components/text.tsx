// Text — the Solid host primitive for RN's <Text>. Same children/ref idiom as ./view.tsx; read
// that file's header first, it carries the reasoning both share.
//
// THE NESTING (`RCTText` vs `RCTVirtualText`) IS NOT THIS FILE'S JOB, and that is worth stating
// because it is the one place React's own renderer needs a context. React Native tracks a
// TextAncestor context so a <Text> inside another <Text> renders as a virtual span instead of a
// paragraph host. Here the retained tree already knows: the engine's commit walk carries a
// `hasTextAncestor` flag down and picks the view name itself
// (`viewNameFor` in core/engine/src/commit.ts — `node.isText && hasTextAncestor` -> RCTVirtualText),
// and it re-creates the node from scratch when that kind flips. So there is no Solid context, no
// provider, and nothing for an adapter to thread; every adapter emits the same flat
// `symbiote-text` and the engine resolves the position-dependent name for all of them. The
// Solid equivalent of TextAncestorContext is deliberately ABSENT, not missing.

import { splitProps, type Ref } from 'solid-js';
import type { JSX } from '../jsx-runtime';
import {
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAriaProps,
  resolveTextProps,
} from '@symbiote-native/components';
import type {
  IClassNameValue,
  IStyleProp,
  ISymbioteEvent,
  ITextStyle,
} from '@symbiote-native/engine';
import type { IHostInstance } from '../host-instance';
import { applyHostRef } from '../utils/host-ref';
import { withStableKeys } from '../utils/stable-keys';

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

export function Text(props: ITextProps): JSX.Element {
  const [local, rest] = splitProps(props, ['children', 'ref']);

  const bag = withStableKeys(() =>
    resolveTextProps({ ...resolveAccessibilityProps(rest) }),
  );

  const attachRef = (node: IHostInstance): void => {
    applyHostRef(local.ref, node);
  };

  return (
    <symbiote-text ref={attachRef} {...bag()}>
      {local.children}
    </symbiote-text>
  );
}
