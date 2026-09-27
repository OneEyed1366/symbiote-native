// Modal: the React lifecycle half. RCTModalHostView is an ordinary Fabric host node committing
// through the same childSet as the rest of the tree (no second JS surface). The style math (the
// backdrop override, the container/host styles, the presentationStyle default), the visible gate,
// and the iOS keep-alive reducer all live framework-agnostic in @symbiote-native/components and are
// shared verbatim with Vue; here React supplies only the lifecycle: useReducer over the keep-alive
// state machine + a post-render effect to drive the visible→hidden transition, and the Descriptor
// bridge, nesting the user children UNDER the container View.
//
// Deferred vs RN: RN's native exit-animation timing (the modalDismissed emitter on old-renderer
// iOS) is not reproduced; onDismiss is delivered as the native topDismiss DirectEvent via the
// host's onDismiss prop (it rides `...passthrough`), and the keep-alive holds the node mounted
// through the exit transition. The native exit-animation timing is what's deferred, not the
// callback contract.

import {
  createElement,
  useEffect,
  useReducer,
  type FC,
  type ReactNode,
} from 'react';
import { dlog, Platform, type ISymbioteEvent } from '@symbiote-native/engine';
import {
  createInitialModalState,
  isModalVisible,
  modalReducer,
  modalVisibilityAction,
  renderModal,
  resolveAccessibilityProps,
  shouldRenderModal,
  type IAccessibilityProps,
  type IAriaProps,
  type IModalAnimationType,
  type IModalOrientation,
  type IModalPresentationStyle,
} from '@symbiote-native/components';
import type { IStyleProp, IViewStyle } from '../../utils/styles';

export type {
  IModalAnimationType,
  IModalPresentationStyle,
  IModalOrientation,
  IModalOrientationChangeEvent,
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
  onShow?: () => void;
  onDismiss?: () => void;
  onRequestClose?: () => void;
  // The engine hands every listener the ISymbioteEvent wrapper, so the orientation is read at
  // event.nativeEvent.orientation (IModalOrientationChangeEvent describes that payload).
  onOrientationChange?: (event: ISymbioteEvent) => void;
  style?: IStyleProp<IViewStyle>;
  // Forwarded onto the container View like `style` — resolves through the shared style
  // registry.
  className?: string;
  children?: ReactNode;
}

export const Modal: FC<IModalProps> = rawProps => {
  // Modal owns its host element (modal), so it folds aria/role here; the resolved fields
  // ride the host node via `...passthrough`. The events (onShow/onDismiss/onRequestClose/
  // onOrientationChange) are real ViewConfig DirectEvents, so they too ride passthrough raw.
  // className is pulled out here, like style, and applied to the CONTAINER element below — left in
  // ...passthrough it would land on the outer modal host instead (renderModal composes
  // `style` into the container's style, not the host's).
  const {
    visible,
    transparent,
    backdropColor,
    animationType,
    presentationStyle,
    supportedOrientations,
    hardwareAccelerated,
    statusBarTranslucent,
    navigationBarTranslucent,
    allowSwipeDismissal,
    style,
    className,
    children,
    onDismiss,
    ...passthrough
  } = resolveAccessibilityProps(rawProps);

  // The iOS keep-alive (state/modal.ts): armed on show, dropped only by the native dismiss below.
  const isVisible = isModalVisible(visible);
  const [state, dispatch] = useReducer(
    modalReducer,
    isVisible,
    createInitialModalState,
  );
  useEffect(() => {
    const action = modalVisibilityAction(isVisible);
    if (action !== undefined) dispatch(action);
  }, [isVisible]);

  if (!shouldRenderModal(isVisible, state)) {
    dlog('Modal hidden -> no node committed');
    return null;
  }

  // Modal.js: onDismiss is iOS-only — it drops the keep-alive, then tells the app.
  const handleDismiss = (): void => {
    if (Platform.OS !== 'ios') return;
    dispatch({ type: 'hide' });
    onDismiss?.();
  };

  const root = renderModal({
    visible,
    transparent,
    backdropColor,
    animationType,
    presentationStyle,
    supportedOrientations,
    hardwareAccelerated,
    statusBarTranslucent,
    navigationBarTranslucent,
    allowSwipeDismissal,
    style,
    passthrough: { ...passthrough, onDismiss: handleDismiss },
  });

  // root = modal > [container]; the user children nest UNDER the container View, never as
  // a direct sibling of the host (RN's modal content layout).
  const [container] = root.children;
  if (typeof container === 'string') return null;
  return createElement(
    root.type,
    { key: root.key, ...root.props },
    createElement(
      container.type,
      { key: container.key, ...container.props, className },
      children,
    ),
  );
};
