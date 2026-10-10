// TODO(rn-port): RN's `Modal.js` is a React component, only its native host view is shared

// Modal: the render half (framework-agnostic). RCTModalHostView is an ordinary Fabric host
// node: it lives in the SAME childSet and commits through the SAME completeRoot as the rest of
// the tree. The native iOS/Android view presents its own window internally; there is no second
// root or second surface on the JS side. So this is a thin render exactly like the others: it
// maps to the `modal` intrinsic the host config routes to ModalHostView, wrapping a
// full-screen container View that holds the user children (injected by the adapter). Shared
// verbatim: React and Vue both bridge this Descriptor; the keep-alive state lives in state/modal.ts.

import {
  dlog,
  I18nManager,
  type IColorValue,
  type IStyleProp,
  type IViewStyle,
} from '@symbiote-native/engine';
import { el, type IDescriptor } from '../descriptor';

export type IModalAnimationType = 'none' | 'slide' | 'fade';

export type IModalPresentationStyle =
  'fullScreen' | 'pageSheet' | 'formSheet' | 'overFullScreen';

export type IModalOrientation =
  | 'portrait'
  | 'portrait-upside-down'
  | 'landscape'
  | 'landscape-left'
  | 'landscape-right';

// What Fabric puts on `nativeEvent` for `topOrientationChange`, not what a handler receives.
// The engine wraps every `onX` handler, so it reads `nativeEvent.orientation` narrowed at runtime
export type IModalOrientationChangeEvent = {
  orientation: 'portrait' | 'landscape';
};

// The full-screen box RN anchors the modal content in (Modal.js styles.container: [side]:0,
// top:0, flex:1, backgroundColor:'white'). It is NOT position:absolute, it is a flex child that
// fills the ModalHostView, whose shadow node self-sizes to the screen
// (ModalHostViewComponentDescriptor sets the node size to screenSize). An absolute container with
// only top/left would collapse to its content instead. The backdrop color is layered on at render
// time so transparent/backdropColor win.
//
// `[side]` is NOT always 'left' — vendor computes it once at module load from
// `I18nManager.getConstants().isRTL` (`Modal.js:372`: `isRTL ? 'right' : 'left'`), so a modal in an
// RTL layout pins its container to the RIGHT edge. `renderModal`'s own `isRTL` parameter supplies it.
const CONTAINER_STYLE_BASE: Readonly<Omit<IViewStyle, 'left' | 'right'>> = {
  top: 0,
  flex: 1,
};

// RN sets styles.modal (position:'absolute') on RCTModalHostView itself (Modal.js styles.modal +
// style={styles.modal} on the host).
const MODAL_HOST_STYLE: Readonly<IViewStyle> = {
  position: 'absolute',
};

// Modal.js `_shouldSetResponder`: no responder event bubbles out of the modal to a view above it
const claimResponder = (): boolean => true;

const TRANSPARENT_BACKDROP = 'transparent';
const OPAQUE_BACKDROP = 'white';
const DEFAULT_ANIMATION_TYPE: IModalAnimationType = 'none';

// presentationStyle default (Modal.js: undefined -> 'fullScreen', but transparent flips it to
// 'overFullScreen').
const PRESENTATION_FULL_SCREEN: IModalPresentationStyle = 'fullScreen';
const PRESENTATION_OVER_FULL_SCREEN: IModalPresentationStyle = 'overFullScreen';

// The pre-resolved inputs `renderModal` paints from, the adapter narrows the typed fields
// Events, folded accessibility props and `testID` go into `passthrough`, untouched on the host node
export type IModalViewProps = {
  visible?: boolean;
  transparent?: boolean;
  backdropColor?: IColorValue;
  animationType?: IModalAnimationType;
  presentationStyle?: IModalPresentationStyle;
  supportedOrientations?: ReadonlyArray<IModalOrientation>;
  hardwareAccelerated?: boolean;
  statusBarTranslucent?: boolean;
  navigationBarTranslucent?: boolean;
  allowSwipeDismissal?: boolean;
  style?: IStyleProp<IViewStyle>;
  passthrough: Record<string, unknown>;
};

function backdropOverrideOf(view: IModalViewProps): IViewStyle {
  if (view.transparent === true) {
    return { backgroundColor: TRANSPARENT_BACKDROP };
  }
  if (view.backdropColor === undefined) return {};
  return { backgroundColor: view.backdropColor };
}

// The backdrop override goes last, so `transparent` and `backdropColor` win over `style`
function containerOf(view: IModalViewProps, isRTL: boolean): IDescriptor {
  const containerStyle: IStyleProp<IViewStyle> = [
    {
      ...CONTAINER_STYLE_BASE,
      ...(isRTL ? { right: 0 } : { left: 0 }),
      backgroundColor: OPAQUE_BACKDROP,
    },
    view.style,
    backdropOverrideOf(view),
  ];
  return el('view', { style: containerStyle, collapsable: false }, []);
}

// `isRTL` is injectable for tests, like the `os` option of `computeInset`
// `I18nManager` resolves its constants once at load with no setter, so a test must pass it in
export function renderModal(
  view: IModalViewProps,
  isRTL: boolean = I18nManager.isRTL,
): IDescriptor {
  dlog('Modal visible -> committing ModalHostView(container View)');

  // RN ignores the deprecated `animated`, `animationType` replaces it
  const { animated: _deprecated, ...passthrough } = view.passthrough;

  const resolvedPresentationStyle =
    view.presentationStyle ??
    (view.transparent === true
      ? PRESENTATION_OVER_FULL_SCREEN
      : PRESENTATION_FULL_SCREEN);

  return el(
    'modal',
    {
      ...passthrough,
      style: MODAL_HOST_STYLE,
      transparent: view.transparent,
      animationType: view.animationType ?? DEFAULT_ANIMATION_TYPE,
      presentationStyle: resolvedPresentationStyle,
      // Platform props named-forwarded to match RCTModalHostView (Modal.js ~336-350): iOS
      // supportedOrientations/allowSwipeDismissal, Android hardwareAccelerated/
      // statusBarTranslucent/navigationBarTranslucent.
      supportedOrientations: view.supportedOrientations,
      // Modal.js `defaultProps = {hardwareAccelerated: false, visible: true}`.
      hardwareAccelerated: view.hardwareAccelerated ?? false,
      statusBarTranslucent: view.statusBarTranslucent,
      navigationBarTranslucent: view.navigationBarTranslucent,
      allowSwipeDismissal: view.allowSwipeDismissal,
      visible: view.visible ?? true,
      onStartShouldSetResponder: claimResponder,
    },
    // `collapsable: false` keeps the container a real shadow node, the adapter injects the user
    // children under it, never as a direct sibling of the host
    [containerOf(view, isRTL)],
  );
}
