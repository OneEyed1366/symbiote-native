// Canonical home of `IModalProps`, see `view-props.ts` for why it is a plain `.ts` file
// The agnostic base types from `@symbiote-native/components` are re-exported verbatim
// The rest is per adapter, as `children` is a `Snippet`: <prop_types_split_agnostic_vs_per_adapter>
import type { Snippet } from 'svelte';
import type {
  IColorValue,
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';
import type {
  IAccessibilityProps,
  IAriaProps,
  IModalAnimationType,
  IModalOrientation,
  IModalPresentationStyle,
} from '@symbiote-native/components';
import type { ISvelteClassValue } from '../../class-value';

export type {
  IModalAnimationType,
  IModalOrientation,
  IModalOrientationChangeEvent,
  IModalPresentationStyle,
} from '@symbiote-native/components';

export type IModalProps = IAccessibilityProps &
  IAriaProps & {
    visible?: boolean;
    transparent?: boolean;
    backdropColor?: IColorValue;
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
    // passthrough
    onShow?: () => void;
    onDismiss?: () => void;
    onRequestClose?: () => void;
    // The engine hands every listener the ISymbioteEvent wrapper, so the orientation is read at
    // event.nativeEvent.orientation (IModalOrientationChangeEvent describes that payload).
    onOrientationChange?: (event: ISymbioteEvent) => void;
    style?: IStyleProp<IViewStyle>;
    // Targets the CONTAINER View renderModal wraps the children in, not the outer modal
    // host — same split React's className / Vue's class apply on the container, not the host.
    class?: ISvelteClassValue;
    children?: Snippet;
  };
