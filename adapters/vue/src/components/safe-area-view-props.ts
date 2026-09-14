// The `<safe-area-view>` tag's prop surface. The wrapper is gone: its whole body was
// `normalizeVueAttrs` + `resolveAccessibilityProps` + one `h()`, and both folds now run below every
// path — kebab->camel and `id -> nativeID` in the renderer's `patchProp`, aria/role in the engine's
// `fabricProps`. The prop type stays, for a component forwarding a bag.

import type { IClassNameValue } from '@symbiote-native/engine';
import type {
  IAccessibilityProps,
  IAriaProps,
} from '@symbiote-native/components';

// Vue takes children via slots, so this mirrors React's a11y + ViewProps surface minus children.
export type ISafeAreaViewProps = IAccessibilityProps &
  IAriaProps & {
    // RN's W3C alias for `nativeID`, folded by the spec entry's ID_ALIAS.
    id?: string;
    class?: IClassNameValue;
  };
