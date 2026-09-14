// The prop surface of `<button>`, for Solid.
//
// No component left to type — the element IS the tag. RN's Button takes no children (`title` is a
// string prop, Button.js:363) and builds its own touchable > view > text subtree, which the engine
// behavior now builds instead (`core/components/src/behaviors/button.ts`). This stays exported
// because an app that wraps the tag in its own component types the bag it forwards against
// something, the same reason `touchable-native-feedback/touchable-native-feedback-props.ts`
// survived that move.
//
// The base is fully agnostic — no children, no ref, no render callback — so it lives ONCE in
// @symbiote-native/components (<prop_types_split_agnostic_vs_per_adapter>). Only the class-styling
// field is per-adapter, and Solid spells it `class`, matching View, Text and Image.
import type { IClassNameValue } from '@symbiote-native/engine';
import type { IButtonProps as IButtonBaseProps } from '@symbiote-native/components';

export type IButtonProps = IButtonBaseProps & { class?: IClassNameValue };
