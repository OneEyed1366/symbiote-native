// `IModalProps`'s canonical home — see `view-props.ts`'s header comment for why this type
// lives in a plain `.ts` file rather than being re-exported straight out of `index.svelte`.
// The shared @symbiote-native/components base types (IModalAnimationType/IModalPresentationStyle/
// IModalOrientation/IModalOrientationChangeEvent) are framework-agnostic and re-exported verbatim;
// visible/transparent/backdropColor/... plus style/class/children/the event callbacks are declared
// here per <prop_types_split_agnostic_vs_per_adapter> (children is a Svelte Snippet, so the full
// prop type is per-adapter like React's/Vue's IModalProps, not shared).
import type { Snippet } from 'svelte';
import type { IClassNameValue, IStyleProp, IViewStyle } from '@symbiote-native/engine';
import type {
  IAccessibilityProps,
  IAriaProps,
  IModalAnimationType,
  IModalOrientation,
  IModalOrientationChangeEvent,
  IModalPresentationStyle,
} from '@symbiote-native/components';
import type { ISvelteClassValue } from '../../class-value';

export type {
  IModalAnimationType,
  IModalOrientation,
  IModalOrientationChangeEvent,
  IModalPresentationStyle,
} from '@symbiote-native/components';

export interface IModalProps extends IAccessibilityProps, IAriaProps {
  visible?: boolean;
  transparent?: boolean;
  backdropColor?: string;
  animationType?: IModalAnimationType;
  presentationStyle?: IModalPresentationStyle;
  supportedOrientations?: ReadonlyArray<IModalOrientation>;
  hardwareAccelerated?: boolean;
  // navigationBarTranslucent makes the Android nav bar translucent; RN requires
  // statusBarTranslucent true alongside it (Modal.js ~172 / confirmProps ~193).
  statusBarTranslucent?: boolean;
  navigationBarTranslucent?: boolean;
  // allowSwipeDismissal lets a swipe-down dismiss the modal on iOS; RN pairs it with
  // onRequestClose to handle the dismissal (Modal.js ~155).
  allowSwipeDismissal?: boolean;
  // Real ViewConfig DirectEvents (onShow/onDismiss/onRequestClose/onOrientationChange) —
  // idiomatic Svelte 5 callback props, riding the object bag raw like every other adapter's
  // passthrough (svelte-adapter-dom-shim skill §3g(c): "most of §5 collapses").
  onShow?: () => void;
  onDismiss?: () => void;
  onRequestClose?: () => void;
  onOrientationChange?: (event: IModalOrientationChangeEvent) => void;
  style?: IStyleProp<IViewStyle>;
  // Targets the CONTAINER View renderModal wraps the children in, not the outer symbiote-modal
  // host — same split React's className / Vue's class apply on the container, not the host.
  class?: ISvelteClassValue;
  children?: Snippet;
}
