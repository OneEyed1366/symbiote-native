// KeyboardAvoidingView, the Solid lifecycle half over the shared `createKeyboardAvoidingModel`
// Nothing destructures `props`: they are getters, read at event time or inside an accessor

import { createMemo, createSignal, onCleanup, splitProps } from 'solid-js';
import type { JSX } from '../jsx-runtime';
import {
  createKeyboardAvoidingModel,
  keyboardAvoidingEventNamesFor,
  readPrefersCrossFadeTransitions,
  resolveKeyboardAvoidingLayout,
  DEFAULT_VERTICAL_OFFSET,
  type IAccessibilityProps,
  type IAriaProps,
  type IKeyboardAvoidingBehavior,
} from '@symbiote-native/components';
import {
  Keyboard,
  Platform,
  type IClassNameValue,
  type IEventSubscription,
  type IStyleProp,
  type ISymbioteEvent,
  type IViewStyle,
} from '@symbiote-native/engine';
import { withStableKeys } from '../utils/stable-keys';
import type { IViewProps } from './view-props';

export type { IKeyboardAvoidingBehavior } from '@symbiote-native/components';

// `children` is a Solid element, so the prop type is per adapter over the shared field base
export type IKeyboardAvoidingViewProps = IAccessibilityProps &
  IAriaProps & {
    behavior?: IKeyboardAvoidingBehavior;
    // Only an explicit `false` disables, RN gates every inset on `enabled ?? true`
    enabled?: boolean;
    // Distance from the top of the screen to this view, subtracted from the keyboard's top edge
    keyboardVerticalOffset?: number;
    // Style of the inner content container, used only when behavior is 'position'
    contentContainerStyle?: IStyleProp<IViewStyle>;
    style?: IStyleProp<IViewStyle>;
    // Solid's spelling of a registered class name, forwarded onto the wrapper View
    class?: IClassNameValue;
    // The wrapper's layout is read for the inset first, then the caller's handler is called
    onLayout?: (event: ISymbioteEvent) => void;
    children?: JSX.Element;
  };

// Read here, the rest forwards onto the wrapper which folds aria/role and accessibility* once
const HANDLED_PROPS = [
  'behavior',
  'enabled',
  'keyboardVerticalOffset',
  'contentContainerStyle',
  'style',
  'onLayout',
  'children',
] as const;

// The model with its inset signal and keyboard subscriptions, kept apart so the component reads as
// the element assembly
function createKeyboardModel(props: IKeyboardAvoidingViewProps) {
  const [inset, setInset] = createSignal(0);
  // A device setting, not state: nothing should repaint when the promise lands
  let prefersCrossFadeTransitions = false;
  void readPrefersCrossFadeTransitions().then(enabled => {
    prefersCrossFadeTransitions = enabled;
  });
  const model = createKeyboardAvoidingModel({
    options: () => ({
      behavior: props.behavior,
      enabled: props.enabled !== false,
      keyboardVerticalOffset:
        props.keyboardVerticalOffset ?? DEFAULT_VERTICAL_OFFSET,
    }),
    setInset,
    prefersCrossFade: () => prefersCrossFadeTransitions,
  });

  // Subscribed in the setup body, which runs once per mount, and removed when the root is disposed
  const events = keyboardAvoidingEventNamesFor(Platform.OS);
  const subscriptions: IEventSubscription[] = [
    Keyboard.addListener(events.show, model.keyboardShown),
    Keyboard.addListener(events.hide, model.keyboardHidden),
  ];
  onCleanup(() => {
    for (const subscription of subscriptions) subscription.remove();
  });
  return { inset, model };
}

export function KeyboardAvoidingView(
  props: IKeyboardAvoidingViewProps,
): JSX.Element {
  const [local, rest] = splitProps(props, HANDLED_PROPS);
  const { inset, model } = createKeyboardModel(props);

  const handleLayout = (event: ISymbioteEvent): void => {
    model.laidOut(event.nativeEvent.layout);
    local.onLayout?.(event);
  };

  const layout = createMemo(() =>
    resolveKeyboardAvoidingLayout({
      behavior: local.behavior,
      // `inset()` is not read when disabled, so a disabled view does not subscribe to the signal
      effectiveInset: local.enabled === false ? 0 : inset(),
      initialHeight: model.initialHeight(),
      style: local.style,
      contentContainerStyle: local.contentContainerStyle,
    }),
  );

  // Named so the children survive a keystroke: `layout()` is a fresh object per keyboard event,
  // and this boolean only notifies when the structure flips, `insert` would rebuild the subtree
  const isNested = createMemo(() => layout().kind === 'nested');

  // The inset reaches the host as a prop, `spread` diffs it on the same element
  const innerStyle = (): IStyleProp<IViewStyle> | undefined => {
    const resolved = layout();
    return resolved.kind === 'nested' ? resolved.innerStyle : undefined;
  };

  const wrapperProps = createMemo((): IViewProps => ({
    ...rest,
    style: layout().wrapperStyle,
    // Last, so the model always measures, the caller's handler is invoked from inside
    onLayout: handleLayout,
  }));

  // `spread` has no removal pass, so a key that stops being emitted would keep its last value
  const stableWrapperProps = withStableKeys(wrapperProps);

  return (
    <view {...stableWrapperProps()}>
      {isNested() ? (
        <view style={innerStyle()}>{local.children}</view>
      ) : (
        local.children
      )}
    </view>
  );
}
