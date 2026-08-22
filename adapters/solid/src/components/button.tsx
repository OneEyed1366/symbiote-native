// Button — the minimal cross-platform button, rendered in its iOS shape per RN's Button.js: a
// TouchableOpacity wrapping a Text. The base text style, the role constant and the color fold
// (a caller `color` tints the label; `disabled` greys it, disabled winning) are shared in
// @symbiote-native/components' render-button and are called, never re-derived; Solid only composes
// its own TouchableOpacity + Text and forwards the native-only props.
//
// NO descriptorToSolid here, and none in React/Vue/Svelte either: the tree is two COMPONENTS, not
// a Descriptor. There is no renderButton() to bridge — the shared half is the style/role math.
//
// NOTHING here destructures `props` at setup. Solid props are getters and a component body runs
// ONCE; splitProps keeps both halves reactive and every read sits inside an accessor or a memo.

import { createMemo, splitProps } from 'solid-js';
import type { JSX } from '../jsx-runtime';
import {
  BUTTON_ACCESSIBILITY_ROLE,
  resolveButtonTextStyle,
  type IButtonProps as IButtonBaseProps,
} from '@symbiote-native/components';
import type { IClassNameValue } from '@symbiote-native/engine';
import { Text } from './text';
import { TouchableOpacity } from './touchable';

// IButtonProps is framework-agnostic in full — `title` is a string, there are no children, no ref
// and no render callback — so it lives ONCE in @symbiote-native/components and is RE-EXPORTED here
// rather than redeclared (<prop_types_split_agnostic_vs_per_adapter>). Only the class-styling
// field is per-adapter, and Solid's spelling is `class`, matching View, Text and Image (React's is
// `className`); it is not split off below, so it forwards onto the TouchableOpacity.
export type IButtonProps = IButtonBaseProps & { class?: IClassNameValue };

export function Button(props: IButtonProps): JSX.Element {
  // Only what Button CONSUMES or re-maps is split off. Everything else — onPress, disabled,
  // testID, the TV-focus props, the accessibility/aria surface, `class` — stays in `rest` and
  // rides the single bag below onto the TouchableOpacity. The TV-focus props are real Fabric
  // props the pressable forwards without typing; a JSX spread carries them through unchecked
  // (they are inert on a phone host).
  const [local, rest] = splitProps(props, [
    'title',
    'color',
    'touchSoundDisabled',
  ]);

  const textStyle = createMemo(() =>
    resolveButtonTextStyle(local.color, rest.disabled),
  );

  // ONE bag, not a spread followed by explicit props on the tag: Solid's mergeProps (which the
  // compiler uses for that shape) takes the first NON-undefined value scanning back to front, so
  // an override that can be undefined silently loses (.claude/rules/solid-descriptor-bridge.md
  // §6). A plain object is last-wins — the React semantics this is ported from, and what pins RN's
  // fixed role / accessible / disabled-state OVER the caller's own. touchSoundDisabled is RE-MAPPED
  // here, not forwarded: the pressable spells it android_disableSound. Return type left INFERRED;
  // widening to Record<string, unknown> would stop typing `onPress` too.
  const touchableProps = () => ({
    ...rest,
    android_disableSound: local.touchSoundDisabled,
    accessibilityRole: BUTTON_ACCESSIBILITY_ROLE,
    accessible: true,
    accessibilityState: { disabled: rest.disabled },
  });

  return (
    <TouchableOpacity {...touchableProps()}>
      <Text style={textStyle()}>{local.title}</Text>
    </TouchableOpacity>
  );
}
