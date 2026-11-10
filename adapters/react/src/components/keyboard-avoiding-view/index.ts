// KeyboardAvoidingView over the shared `createKeyboardAvoidingModel`, which holds the frame, the
// last keyboard event and the inset rules of RN's class
// React supplies the inset state, the keyboard subscriptions and the element assembly

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
  Keyboard,
  Platform,
  type ISymbioteEvent,
} from '@symbiote-native/engine';
import {
  createKeyboardAvoidingModel,
  keyboardAvoidingEventNamesFor,
  readPrefersCrossFadeTransitions,
  resolveKeyboardAvoidingLayout,
  DEFAULT_VERTICAL_OFFSET,
  type IKeyboardAvoidingBehavior,
} from '@symbiote-native/components';
import { type IViewProps } from '../../components';
import type {
  IAccessibilityProps,
  IAriaProps,
} from '@symbiote-native/components';
import type { IStyleProp, IViewStyle } from '../../utils/styles';

export type { IKeyboardAvoidingBehavior } from '@symbiote-native/components';

// Resolved once: Platform.OS is fixed for the process
const KEYBOARD_EVENTS = keyboardAvoidingEventNamesFor(Platform.OS);

export type IKeyboardAvoidingViewProps = IAccessibilityProps &
  IAriaProps & {
    behavior?: IKeyboardAvoidingBehavior;
    // When false the view passes through untouched in every behavior mode, default true
    enabled?: boolean;
    // Distance from the top of the screen to this view, subtracted from the inset
    keyboardVerticalOffset?: number;
    // Style of the inner content container, used only when behavior is 'position'
    contentContainerStyle?: IStyleProp<IViewStyle>;
    style?: IStyleProp<IViewStyle>;
    // Not destructured below, so it forwards onto the wrapper View which resolves it
    className?: string;
    children?: ReactNode;
    onLayout?: (event: ISymbioteEvent) => void;
  };

type IModelOptions = {
  behavior?: IKeyboardAvoidingBehavior;
  enabled: boolean;
  keyboardVerticalOffset: number;
};

// The model, its inset state and the keyboard subscriptions, kept apart so the component reads as
// the element assembly
function useKeyboardAvoidingModel(options: IModelOptions) {
  const [inset, setInset] = useState(0);
  // The model reads the options at event time, so a changed prop needs no new subscription
  const optionsRef = useRef(options);
  optionsRef.current = options;
  // A device setting that cannot change mid-session, learning it must not re-render
  const prefersCrossFadeRef = useRef(false);
  const [model] = useState(() =>
    createKeyboardAvoidingModel({
      options: () => optionsRef.current,
      setInset,
      prefersCrossFade: () => prefersCrossFadeRef.current,
    }),
  );

  useEffect(() => {
    void readPrefersCrossFadeTransitions().then(prefers => {
      prefersCrossFadeRef.current = prefers;
    });
  }, []);

  useEffect(() => {
    const subscriptions = [
      Keyboard.addListener(KEYBOARD_EVENTS.show, model.keyboardShown),
      Keyboard.addListener(KEYBOARD_EVENTS.hide, model.keyboardHidden),
    ];
    return () => {
      for (const subscription of subscriptions) subscription.remove();
    };
  }, [model]);

  return { inset, model };
}

// `onLayout` is widened through a typed variable (no `as`), View's public type lacks it
function wrapperElement(
  rest: IAccessibilityProps & IAriaProps,
  wrapStyle: IStyleProp<IViewStyle> | undefined,
  onLayout: (event: ISymbioteEvent) => void,
  content: ReactNode,
): ReactElement {
  const wrapperProps: IViewProps & {
    onLayout: (event: ISymbioteEvent) => void;
  } = { ...rest, style: wrapStyle, onLayout, children: content };
  return createElement('view', wrapperProps);
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
    // The wrapper is the View FC, which folds aria/role and accessibility* once itself
    ...accessibilityRest
  } = props;
  const { inset, model } = useKeyboardAvoidingModel({
    behavior,
    enabled,
    keyboardVerticalOffset,
  });

  const handleLayout = (event: ISymbioteEvent): void => {
    model.laidOut(event.nativeEvent.layout);
    onLayout?.(event);
  };

  // Disabled forces the inset to 0, so every behavior mode renders the view untouched
  const layout = resolveKeyboardAvoidingLayout({
    behavior,
    effectiveInset: enabled ? inset : 0,
    initialHeight: model.initialHeight(),
    style,
    contentContainerStyle,
  });
  const content =
    layout.kind === 'nested'
      ? createElement('view', { style: layout.innerStyle }, children)
      : children;
  return wrapperElement(
    accessibilityRest,
    layout.wrapperStyle,
    handleLayout,
    content,
  );
};
