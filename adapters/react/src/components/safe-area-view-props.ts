// The prop surface of `<safe-area-view>`, for React.
//
// No component left to type — the element IS the tag. There was never any JS-side translation
// here: RN renders the native RCTSafeAreaView and the host does the inset math, so the wrapper's
// whole body was a passthrough plus the aria fold (now `fabricProps`) and `id -> nativeID` (now
// `foldHostBag`, driven by HOST_PRIMITIVES). This stays exported because an app that wraps the tag
// in its own component types the bag it forwards against something.
//
// `children` keeps this per-adapter rather than shared: it is a React `ReactNode`
// (<prop_types_split_agnostic_vs_per_adapter>).
import type { ReactNode } from 'react';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import type {
  IAccessibilityProps,
  IAriaProps,
} from '@symbiote-native/components';
import type { IStyleProp, IViewStyle } from '../utils/styles';

export interface ISafeAreaViewProps extends IAccessibilityProps, IAriaProps {
  style?: IStyleProp<IViewStyle>;
  // RN's W3C-named alias for `nativeID`, folded by the spec entry's ID_ALIAS.
  id?: string;
  className?: string;
  children?: ReactNode;
  onLayout?: (event: ISymbioteEvent) => void;
}
