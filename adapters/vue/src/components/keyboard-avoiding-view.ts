// KeyboardAvoidingView: the Vue lifecycle half. The inset math + the behavior->style/structure
// decision live in @symbiote-native/components (render-keyboard-avoiding-view), shared verbatim
// with React; Vue supplies only the reactivity: a ref holds the inset, onMounted subscribes to
// this host's two keyboard notifications (keyboardAvoidingEventNamesFor — will* on iOS, did* on
// Android, and never changeFrame), onUnmounted tears the subscriptions down, and onLayout
// measures the wrapper frame that feeds the next event's inset.
//
// Inputs arrive as attrs (untyped), so each is narrowed with a runtime guard, never a cast.
// rawAttrs runs through normalizeVueAttrs so a template `:keyboard-vertical-offset` resolves.

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
  dlog,
  type ISymbioteEvent,
  type IEventSubscription,
  type IClassNameValue,
  type IStyleProp,
  type IViewStyle,
} from '@symbiote-native/engine';
import {
  computeInset,
  keyboardAvoidingEventNamesFor,
  readKeyboardFrame,
  readPrefersCrossFadeTransitions,
  readLayoutFrame,
  resolveKeyboardAvoidingLayout,
  resolveAccessibilityProps,
  DEFAULT_VERTICAL_OFFSET,
  type IAccessibilityProps,
  type IAriaProps,
  type IKeyboardAvoidingBehavior,
  type IMeasuredFrame,
} from '@symbiote-native/components';
import { normalizeVueAttrs } from '../utils/normalize-attrs';

// layout is NOT here: it is a typed Vue emit (@layout), wrapper-composed from the wrapper's own
// onLayout (which the component already intercepts to measure the frame).
export interface IKeyboardAvoidingViewProps
  extends IAccessibilityProps, IAriaProps {
  behavior?: IKeyboardAvoidingBehavior;
  enabled?: boolean;
  keyboardVerticalOffset?: number;
  contentContainerStyle?: IStyleProp<IViewStyle>;
  style?: IStyleProp<IViewStyle>;
  // Not in HANDLED_ATTRS below - passes through untouched onto the wrapper host.
  class?: IClassNameValue;
  testID?: string;
}

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

// Built at the a11y-intersection type (a real narrowing, not a cast) so resolveAccessibilityProps
// folds aria-* into accessibility* before it reaches the wrapper host.
type IForwardBag = IAccessibilityProps & IAriaProps & Record<string, unknown>;

function forwardAttrs(attrs: Record<string, unknown>): IForwardBag {
  const result: IForwardBag = {};
  for (const key of Object.keys(attrs)) {
    if (!HANDLED_ATTRS.includes(key)) result[key] = attrs[key];
  }
  return result;
}

export type { IKeyboardAvoidingBehavior } from '@symbiote-native/components';

export const KeyboardAvoidingView = defineComponent<
  IKeyboardAvoidingViewProps,
  IKeyboardAvoidingViewEmits
>(
  (_props, { attrs: rawAttrs, slots, emit }) => {
    const inset = ref(0);
    // Mutable, not reactive: changing the measured frame alone shouldn't re-render; it feeds the
    // next keyboard event's inset math.
    let frame: IMeasuredFrame | undefined;
    let initialHeight: number | undefined;
    // A device accessibility setting, read once per mount. Deliberately a plain variable, not a
    // ref: it cannot change during a session, so nothing should re-render when it resolves.
    let prefersCrossFadeTransitions = false;

    // Read at EVENT time rather than captured once: attrs is live, and both the offset and the
    // behavior feed every keyboard notification's inset math.
    const currentAttrs = (): Record<string, unknown> =>
      normalizeVueAttrs(rawAttrs);

    const verticalOffset = (): number => {
      const offset = currentAttrs().keyboardVerticalOffset;
      return typeof offset === 'number' ? offset : DEFAULT_VERTICAL_OFFSET;
    };

    const onShow = (payload: unknown): void => {
      const keyboard = readKeyboardFrame(payload);
      const next = computeInset(frame, keyboard, verticalOffset(), {
        behavior: asBehavior(currentAttrs().behavior),
        // The inset CURRENTLY applied (RN's this.state.bottom), read live off the reactive cell:
        // in 'height' mode the wrapper is shrunk by it, so the next onLayout under-reports the
        // frame by exactly that much and core adds it back.
        previousInset: inset.value,
        prefersCrossFadeTransitions,
      });
      dlog(`KeyboardAvoidingView show -> inset ${next}`);
      inset.value = next;
    };
    const onHide = (): void => {
      dlog('KeyboardAvoidingView hide -> inset 0');
      inset.value = 0;
    };

    let subscriptions: IEventSubscription[] = [];
    onMounted(() => {
      // TWO notifications, per host: iOS takes the will* pair so the view rides up with the
      // keyboard animation, Android the did* pair. changeFrame is deliberately absent — with an
      // undocked/split/floating iOS keyboard it fires BEFORE the hide, mid-dismissal.
      const events = keyboardAvoidingEventNamesFor(Platform.OS);
      subscriptions = [
        Keyboard.addListener(events.show, onShow),
        Keyboard.addListener(events.hide, onHide),
      ];
      // Nobody awaits this, so it goes through the core wrapper, which answers false on a failed
      // native read instead of leaving an unhandled rejection.
      void readPrefersCrossFadeTransitions().then(enabled => {
        prefersCrossFadeTransitions = enabled;
      });
    });
    onUnmounted(() => {
      for (const subscription of subscriptions) subscription.remove();
      subscriptions = [];
    });

    const handleLayout = (event: ISymbioteEvent): void => {
      const measured = readLayoutFrame(event.nativeEvent.layout);
      if (measured !== undefined) {
        frame = measured;
        if (initialHeight === undefined) initialHeight = measured.height;
      }
      emit('layout', event);
    };

    return (): VNode => {
      const attrs = currentAttrs();
      const behavior = asBehavior(attrs.behavior);
      // RN gates every inset on `enabled ?? true`; only an explicit `false` disables.
      const isEnabled = attrs.enabled !== false;
      const effectiveInset = isEnabled ? inset.value : 0;

      const layout = resolveKeyboardAvoidingLayout({
        behavior,
        effectiveInset,
        initialHeight,
        style: isStyleProp(attrs.style) ? attrs.style : undefined,
        contentContainerStyle: isStyleProp(attrs.contentContainerStyle)
          ? attrs.contentContainerStyle
          : undefined,
      });

      const childNodes =
        slots.default !== undefined ? slots.default() : undefined;
      const wrapperProps = {
        ...resolveAccessibilityProps(forwardAttrs(attrs)),
        style: layout.wrapperStyle,
        onLayout: handleLayout,
      };

      // 'nested' pushes the children in an inner view by `bottom: inset`; the wrapper modes
      // adjust the single wrapper directly.
      if (layout.kind === 'nested') {
        return h('symbiote-view', wrapperProps, [
          h('symbiote-view', { style: layout.innerStyle }, childNodes),
        ]);
      }
      return h('symbiote-view', wrapperProps, childNodes);
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
