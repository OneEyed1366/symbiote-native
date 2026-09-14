// The `<safe-area-view>` tag's prop surface. The wrapper forwarded a bag and nothing else — the
// host does all the inset math, there is no JS-side layout anywhere in this project, and the
// `id -> nativeID` alias plus the aria/role fold both run below the adapter (`foldHostBag` and the
// engine's `fabricProps`). So there was nothing left for a component to hold.

import type { JSX } from '../jsx-runtime';
import type {
  IAccessibilityProps,
  IAriaProps,
} from '@symbiote-native/components';
import type {
  IClassNameValue,
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';

// Per-adapter because `children` is a Solid JSX.Element — the test
// <prop_types_split_agnostic_vs_per_adapter> applies: the agnostic field base
// (IAccessibilityProps / IAriaProps, IStyleProp, ISymbioteEvent) is shared, the framework-flavoured
// field is not. React's, Vue's and Svelte's ISafeAreaViewProps are separate declarations for the
// same reason, and an adapter never imports another adapter's types.
export interface ISafeAreaViewProps extends IAccessibilityProps, IAriaProps {
  style?: IStyleProp<IViewStyle>;
  // RN's W3C alias for `nativeID`, folded by the spec entry's ID_ALIAS.
  id?: string;
  // Solid's own spelling for a registered class name (React's is `className`), resolved through
  // the shared style registry by routeProp's class+style merge.
  class?: IClassNameValue;
  // Fires with the measured frame once Fabric lays the view out; a listener also raises the
  // onLayout flag prop so native actually measures.
  onLayout?: (event: ISymbioteEvent) => void;
  children?: JSX.Element;
}
