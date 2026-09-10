// The prop surface of `<button>`, for Angular.
//
// No component left to type — the element IS the tag, matched by `ButtonElement`
// (`../elements.ts`). RN's Button takes no children (`title` is a string prop, Button.js:363) and
// builds its own touchable > view > text subtree, which the engine behavior now builds instead
// (`core/components/src/behaviors/button.ts`). This stays exported because an app that wraps the
// tag in its own component types the bag it forwards against something.
//
// The five callbacks are omitted for the reason every Angular element type omits them: they are
// `(press)` / `(accessibilityAction)` / … OUTPUT bindings here, not inputs. Everything else is the
// shared agnostic surface, re-exported rather than redeclared.
//
// `ButtonElement` inherits the touchable's own inputs (`android_ripple`, `delayLongPress`,
// `activeOpacity`, …) because it extends `TouchableOpacityElement`. That is the element class, not
// this contract: RN's Button declares none of them, so they stay out of the type an app writes
// against.
import type { IButtonProps as ICoreButtonProps } from '@symbiote-native/components';

export type IButtonProps = Omit<
  ICoreButtonProps,
  | 'onPress'
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;
