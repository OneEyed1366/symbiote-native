// KeyboardAvoidingView: the Vue lifecycle half over the shared `createKeyboardAvoidingModel`
// Inputs arrive as attrs and are narrowed with runtime guards, never a cast

import {
  defineComponent,
  h,
  ref,
  onMounted,
  onUnmounted,
  type VNode,
} from '@vue/runtime-core';
import {
  Keyboard,
  Platform,
  type ISymbioteEvent,
  type IEventSubscription,
  type IClassNameValue,
  type IStyleProp,
  type IViewStyle,
} from '@symbiote-native/engine';
import {
  createKeyboardAvoidingModel,
  keyboardAvoidingEventNamesFor,
  readPrefersCrossFadeTransitions,
  resolveKeyboardAvoidingLayout,
  resolveAccessibilityProps,
  DEFAULT_VERTICAL_OFFSET,
  type IAccessibilityProps,
  type IAriaProps,
  type IKeyboardAvoidingBehavior,
} from '@symbiote-native/components';
import { normalizeVueAttrs } from '../utils/normalize-attrs';

// `layout` is a typed Vue emit (`@layout`), composed from the wrapper's own `onLayout`
export type IKeyboardAvoidingViewProps = IAccessibilityProps &
  IAriaProps & {
    behavior?: IKeyboardAvoidingBehavior;
    enabled?: boolean;
    keyboardVerticalOffset?: number;
    contentContainerStyle?: IStyleProp<IViewStyle>;
    style?: IStyleProp<IViewStyle>;
    // Not in `HANDLED_ATTRS`, it passes through untouched onto the wrapper host
    class?: IClassNameValue;
    testID?: string;
  };

export type IKeyboardAvoidingViewEmits = {
  layout: (event: ISymbioteEvent) => boolean;
};

function isStyleProp(value: unknown): value is IStyleProp<IViewStyle> {
  return typeof value === 'object' && value !== null;
}

function asBehavior(value: unknown): IKeyboardAvoidingBehavior | undefined {
  return value === 'height' || value === 'position' || value === 'padding'
    ? value
    : undefined;
}

const HANDLED_ATTRS = [
  'behavior',
  'enabled',
  'keyboardVerticalOffset',
  'contentContainerStyle',
  'style',
  'onLayout',
];

// Typed as the a11y intersection (a real narrowing) so `resolveAccessibilityProps` folds aria-*
type IForwardBag = IAccessibilityProps & IAriaProps & Record<string, unknown>;

function forwardAttrs(attrs: Record<string, unknown>): IForwardBag {
  const result: IForwardBag = {};
  for (const key of Object.keys(attrs)) {
    if (!HANDLED_ATTRS.includes(key)) result[key] = attrs[key];
  }
  return result;
}

export type { IKeyboardAvoidingBehavior } from '@symbiote-native/components';

// The model with its keyboard subscriptions, kept apart so the setup reads as the render
function useKeyboardModel(
  currentAttrs: () => Record<string, unknown>,
  setInset: (inset: number) => void,
) {
  // A device setting read once per mount, a plain variable since nothing should re-render for it
  let prefersCrossFadeTransitions = false;
  const model = createKeyboardAvoidingModel({
    options: () => {
      const attrs = currentAttrs();
      const offset = attrs.keyboardVerticalOffset;
      return {
        behavior: asBehavior(attrs.behavior),
        enabled: attrs.enabled !== false,
        keyboardVerticalOffset:
          typeof offset === 'number' ? offset : DEFAULT_VERTICAL_OFFSET,
      };
    },
    setInset,
    prefersCrossFade: () => prefersCrossFadeTransitions,
  });

  let subscriptions: IEventSubscription[] = [];
  onMounted(() => {
    const events = keyboardAvoidingEventNamesFor(Platform.OS);
    subscriptions = [
      Keyboard.addListener(events.show, model.keyboardShown),
      Keyboard.addListener(events.hide, model.keyboardHidden),
    ];
    // Nobody awaits this, the core wrapper answers false on a failed native read
    void readPrefersCrossFadeTransitions().then(enabled => {
      prefersCrossFadeTransitions = enabled;
    });
  });
  onUnmounted(() => {
    for (const subscription of subscriptions) subscription.remove();
    subscriptions = [];
  });
  return model;
}

export const KeyboardAvoidingView = defineComponent<
  IKeyboardAvoidingViewProps,
  IKeyboardAvoidingViewEmits
>(
  (_props, { attrs: rawAttrs, slots, emit }) => {
    const inset = ref(0);
    // Read at event time, the attrs are live
    const currentAttrs = (): Record<string, unknown> =>
      normalizeVueAttrs(rawAttrs);
    const model = useKeyboardModel(currentAttrs, value => {
      inset.value = value;
    });

    const handleLayout = (event: ISymbioteEvent): void => {
      model.laidOut(event.nativeEvent.layout);
      emit('layout', event);
    };

    return (): VNode => {
      const attrs = currentAttrs();
      // RN gates every inset on `enabled ?? true`, only an explicit `false` disables
      const isEnabled = attrs.enabled !== false;

      const layout = resolveKeyboardAvoidingLayout({
        behavior: asBehavior(attrs.behavior),
        effectiveInset: isEnabled ? inset.value : 0,
        initialHeight: model.initialHeight(),
        style: isStyleProp(attrs.style) ? attrs.style : undefined,
        contentContainerStyle: isStyleProp(attrs.contentContainerStyle)
          ? attrs.contentContainerStyle
          : undefined,
      });

      const childNodes = slots.default?.();
      const wrapperProps = {
        ...resolveAccessibilityProps(forwardAttrs(attrs)),
        style: layout.wrapperStyle,
        onLayout: handleLayout,
      };

      if (layout.kind === 'nested') {
        return h('view', wrapperProps, [
          h('view', { style: layout.innerStyle }, childNodes),
        ]);
      }
      return h('view', wrapperProps, childNodes);
    };
  },
  {
    name: 'KeyboardAvoidingView',
    inheritAttrs: false,
    emits: {
      layout: (_event: ISymbioteEvent): boolean => true,
    },
  },
);
