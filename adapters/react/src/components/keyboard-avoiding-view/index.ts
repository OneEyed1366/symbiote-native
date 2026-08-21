// KeyboardAvoidingView: composes the host View and shifts it out of the keyboard's way as
// the keyboard shows/hides. It subscribes to the Keyboard module (native->JS events) and
// recomputes a bottom inset from the keyboard frame and the view's own measured frame.
// Mirrors RN's Libraries/Components/Keyboard/KeyboardAvoidingView.js, as a function component.
//
// The inset math + the behavior → style/structure decision are framework-agnostic and live in
// @symbiote-native/components (render-keyboard-avoiding-view), shared verbatim with the Vue adapter.
// React supplies only the lifecycle: useState for the inset, useRef for the measured frame and
// the cross-fade setting, the useEffect subscriptions, and the descriptor-free element assembly
// around its children.

import {
  createElement,
  useEffect,
  useRef,
  useState,
  type FC,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  dlog,
  Keyboard,
  Platform,
  type ISymbioteEvent,
} from '@symbiote-native/engine';
import {
  computeInset,
  keyboardAvoidingEventNamesFor,
  readKeyboardFrame,
  readLayoutFrame,
  readPrefersCrossFadeTransitions,
  resolveKeyboardAvoidingLayout,
  DEFAULT_VERTICAL_OFFSET,
  type IKeyboardAvoidingBehavior,
  type IMeasuredFrame,
} from '@symbiote-native/components';
import { View, type IViewProps } from '../../components';
import type {
  IAccessibilityProps,
  IAriaProps,
} from '@symbiote-native/components';
import type { IStyleProp, IViewStyle } from '../../utils/styles';

export type { IKeyboardAvoidingBehavior } from '@symbiote-native/components';

// The two notifications to subscribe to, per host (iOS takes the `will` pair so the view rides
// up with the keyboard animation; Android has no will-notifications). Resolved ONCE at module
// scope: Platform.OS is fixed for the process, so recomputing it per render buys nothing.
const KEYBOARD_EVENTS = keyboardAvoidingEventNamesFor(Platform.OS);

export interface IKeyboardAvoidingViewProps
  extends IAccessibilityProps, IAriaProps {
  behavior?: IKeyboardAvoidingBehavior;
  // When false, the view passes through untouched; no inset is applied in any
  // behavior mode. RN gates every inset/height computation on `enabled ?? true`
  // (KeyboardAvoidingView.js); default true.
  enabled?: boolean;
  // Distance from the top of the screen to this view; subtracted from the inset
  // so a view that doesn't start at y=0 still clears the keyboard exactly.
  keyboardVerticalOffset?: number;
  // Style of the inner content container, used only when behavior is 'position'.
  contentContainerStyle?: IStyleProp<IViewStyle>;
  style?: IStyleProp<IViewStyle>;
  // Not destructured below, so it lands in ...accessibilityRest and forwards onto the wrapper
  // View, which already resolves className. contentContainerStyle stays JS-only (a plain
  // style-object prop, not style/className itself).
  className?: string;
  children?: ReactNode;
  onLayout?: (event: ISymbioteEvent) => void;
}

export const KeyboardAvoidingView: FC<IKeyboardAvoidingViewProps> = props => {
  const {
    behavior,
    enabled = true,
    keyboardVerticalOffset = DEFAULT_VERTICAL_OFFSET,
    contentContainerStyle,
    style,
    children,
    onLayout,
    // The wrapper is the View FC, which runs resolveAccessibilityProps itself, so
    // the raw aria/role + accessibility* props pass through untouched here and fold
    // there once.
    ...accessibilityRest
  } = props;

  const [inset, setInset] = useState(0);
  // Mutable, not state: changing the frame alone shouldn't re-render; it feeds the
  // next keyboard event's inset math.
  const frameRef = useRef<IMeasuredFrame | undefined>(undefined);
  const initialHeightRef = useRef<number | undefined>(undefined);
  // A device accessibility setting, not component state: it cannot change mid-session, and
  // learning it must not re-render. Read once per mount, then fed to every computeInset call.
  const prefersCrossFadeRef = useRef(false);

  useEffect(() => {
    void readPrefersCrossFadeTransitions().then(prefers => {
      prefersCrossFadeRef.current = prefers;
    });
  }, []);

  useEffect(() => {
    const onShow = (payload: unknown): void => {
      const keyboard = readKeyboardFrame(payload);
      // Functional update, not a read of `inset`: this handler is built inside the effect, so a
      // direct read would freeze the value from the render that created it — and 'height' mode
      // feeds the LIVE inset back in to cancel the wrapper's own shrink.
      setInset(previousInset => {
        const next = computeInset(
          frameRef.current,
          keyboard,
          keyboardVerticalOffset,
          {
            behavior,
            previousInset,
            prefersCrossFadeTransitions: prefersCrossFadeRef.current,
          },
        );
        dlog(`KeyboardAvoidingView show -> inset ${next}`);
        return next;
      });
    };
    const onHide = (): void => {
      dlog('KeyboardAvoidingView hide -> inset 0');
      setInset(0);
    };

    const subscriptions = [
      Keyboard.addListener(KEYBOARD_EVENTS.show, onShow),
      Keyboard.addListener(KEYBOARD_EVENTS.hide, onHide),
    ];
    return () => {
      for (const subscription of subscriptions) subscription.remove();
    };
  }, [behavior, keyboardVerticalOffset]);

  const handleLayout = (event: ISymbioteEvent): void => {
    const frame = readLayoutFrame(event.nativeEvent.layout);
    if (frame !== undefined) {
      frameRef.current = frame;
      if (initialHeightRef.current === undefined)
        initialHeightRef.current = frame.height;
    }
    onLayout?.(event);
  };

  // When disabled the inset is forced to 0, so every behavior mode renders the view
  // untouched (RN gates each bottomHeight/height computation on `enabled ?? true`).
  const effectiveInset = enabled ? inset : 0;

  const layout = resolveKeyboardAvoidingLayout({
    behavior,
    effectiveInset,
    initialHeight: initialHeightRef.current,
    style,
    contentContainerStyle,
  });

  // 'nested' ('position') pushes the content in an inner View by `bottom: inset`; the wrapper
  // modes adjust the single wrapper directly.
  if (layout.kind === 'nested') {
    return renderWrapper(
      layout.wrapperStyle,
      createElement(View, { style: layout.innerStyle }, children),
    );
  }
  return renderWrapper(layout.wrapperStyle, children);

  // The wrapper carries onLayout. The View FC's public props don't surface it, but
  // `symbiote-view` routes the base layout event at runtime; widen the props through
  // a typed variable (no inline-literal excess-property check, no `as`) so the
  // onLayout reaches the host without editing View's public type.
  function renderWrapper(
    wrapStyle: IStyleProp<IViewStyle> | undefined,
    content: ReactNode,
  ): ReactElement {
    const wrapperProps: IViewProps & {
      onLayout: (event: ISymbioteEvent) => void;
    } = {
      ...accessibilityRest,
      style: wrapStyle,
      onLayout: handleLayout,
      children: content,
    };
    return createElement(View, wrapperProps);
  }
};
