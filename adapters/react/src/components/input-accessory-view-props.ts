// The prop surface of `<input-accessory-view>`, for React.
//
// No component left to type — the element IS the tag. The wrapper's whole body was the host-node
// assembly it shared with every other adapter (`renderInputAccessoryView`), and that fold now runs
// on the tag itself (`core/components/src/behaviors/input-accessory-view.ts`, wired by
// `../register`). This stays exported because an app that wraps the tag in its own component types
// the bag it forwards against something.
//
// `children` keeps this per-adapter rather than shared: it is a React `ReactNode`
// (<prop_types_split_agnostic_vs_per_adapter>).
import type { ReactNode } from 'react';
import type {
  IAccessibilityProps,
  IAriaProps,
} from '@symbiote-native/components';
import type { IStyleProp, IViewStyle } from '../utils/styles';

export interface IInputAccessoryViewProps
  extends IAccessibilityProps, IAriaProps {
  // The id a TextInput's inputAccessoryViewID points at to dock above its keyboard.
  nativeID?: string;
  backgroundColor?: string;
  style?: IStyleProp<IViewStyle>;
  className?: string;
  children?: ReactNode;
}
