// The prop surface of `<activity-indicator>`, for Angular.
//
// No component left to type — the element IS the tag, matched by `ActivityIndicatorElement`
// (`../elements.ts`). RN's ActivityIndicator is a centering `<View>` around a native spinner
// (ActivityIndicator.js:112) and takes no children, and the engine behavior now builds both nodes
// (`core/components/src/behaviors/activity-indicator/`). This stays exported because an app that
// wraps the tag in its own component types the bag it forwards against something.
//
// The five callbacks are omitted for the reason every Angular element type omits them: they are
// `(layout)` / `(accessibilityAction)` / … OUTPUT bindings here, not inputs. Everything else is the
// shared agnostic surface, re-exported rather than redeclared.
import type { IActivityIndicatorProps as ICoreActivityIndicatorProps } from '@symbiote-native/components';

export type IActivityIndicatorProps = Omit<
  ICoreActivityIndicatorProps,
  | 'onLayout'
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;
