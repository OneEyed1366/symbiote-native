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
  type ReactElement,
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
  warnAboutModalProps,
  type IAccessibilityProps,
  type IAriaProps,
  type IModalAnimationType,
  type IModalOrientation,
  type IModalPresentationStyle,
} from '@symbiote-native/components';
import type { IStyleProp, IViewStyle } from '../../utils/styles';
import { VirtualizedListScopeResetter } from '../virtualized-list/nested-scope';

export type {
  IModalAnimationType,
  IModalPresentationStyle,
  IModalOrientation,
  IModalOrientationChangeEvent,
} from '@symbiote-native/components';

export type IModalProps = IAccessibilityProps &
  IAriaProps & {
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
  };

type IModalTreeInput = Parameters<typeof renderModal>[0] & {
  className: string | undefined;
  children: ReactNode;
};

// The user children nest UNDER the container View, never beside the host, as RN lays a modal out
// They sit outside the list above, so a list in them is not nested in it
function modalTreeOf(input: IModalTreeInput): ReactElement | null {
  const { className, children, ...renderInput } = input;
  const root = renderModal(renderInput);
  const [container] = root.children;
  if (typeof container === 'string') return null;
  return createElement(
    root.type,
    { key: root.key, ...root.props },
    createElement(
      container.type,
      { key: container.key, ...container.props, className },
      createElement(VirtualizedListScopeResetter, null, children),
    ),
  );
}

// The iOS keep-alive: armed on show, dropped only by the native dismiss
function useKeepAlive(visible: boolean | undefined): {
  isVisible: boolean;
  state: ReturnType<typeof createInitialModalState>;
  dispatch: (action: Parameters<typeof modalReducer>[1]) => void;
} {
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
  return { isVisible, state, dispatch };
}

// RN checks on mount and on every update, a dev build only
function useModalWarnings(props: IModalProps): void {
  const {
    presentationStyle,
    transparent,
    navigationBarTranslucent,
    statusBarTranslucent,
    allowSwipeDismissal,
    onRequestClose,
  } = props;
  useEffect(() => {
    warnAboutModalProps({
      presentationStyle,
      transparent,
      navigationBarTranslucent,
      statusBarTranslucent,
      allowSwipeDismissal,
      onRequestClose,
    });
  }, [
    presentationStyle,
    transparent,
    navigationBarTranslucent,
    statusBarTranslucent,
    allowSwipeDismissal,
    onRequestClose,
  ]);
}

export const Modal: FC<IModalProps> = rawProps => {
  useModalWarnings(rawProps);
  // Aria and role fold here, the events are real DirectEvents and ride `passthrough` raw
  // `className` is pulled out to land on the container, in `passthrough` it would reach the host
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

  const { isVisible, state, dispatch } = useKeepAlive(visible);
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

  return modalTreeOf({
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
    className,
    children,
  });
};
