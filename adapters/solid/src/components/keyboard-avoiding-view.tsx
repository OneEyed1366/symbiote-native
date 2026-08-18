// KeyboardAvoidingView — the Solid lifecycle half. It composes a wrapper View and shifts it out of
// the keyboard's way as the keyboard shows/hides. The inset math (readKeyboardFrame /
// readLayoutFrame / computeInset) and the behavior → style/structure decision
// (resolveKeyboardAvoidingLayout) are framework-agnostic and live in @symbiote-native/components,
// shared verbatim with React, Vue, Svelte and Angular. Solid supplies only the reactivity: one
// signal for the inset, three plain variables for the measured frame and the cross-fade setting, a
// subscribe-at-setup / onCleanup pair over the Keyboard module, and the element assembly around its
// own children.
//
// render-keyboard-avoiding-view.ts deliberately returns a layout DESCRIPTION rather than a
// Descriptor tree — KAV wraps a live user subtree, which is the case the render-fn boundary rules
// OUT of core (.claude/rules/component-render-fn-boundary.md). So descriptorToSolid has nothing to
// do here, exactly as in View and Pressable; the two structural shapes ('nested' vs 'wrapper') are
// written directly as the two branches at the bottom.
//
// NO whenCommitted anywhere: KAV issues no imperative native call. It only reads `onLayout`, and the
// engine raises the native layout flag itself the moment a listener rides the prop bag — an event
// cannot arrive before the view exists, so there is no pre-commit window to retry across.
//
// NOTHING here destructures `props`. Solid props are getters and a component body runs ONCE; every
// read below sits inside an accessor, a memo, or an event handler — including
// `keyboardVerticalOffset`, which is read at EVENT time so a changed offset applies to the next
// keyboard event without re-subscribing (React re-runs its useEffect for that; here the closure
// already sees the live value).

import { createMemo, createSignal, onCleanup, splitProps } from 'solid-js';
import type { JSX } from '../jsx-runtime';
import {
  computeInset,
  keyboardAvoidingEventNamesFor,
  readKeyboardFrame,
  readLayoutFrame,
  readPrefersCrossFadeTransitions,
  resolveKeyboardAvoidingLayout,
  DEFAULT_VERTICAL_OFFSET,
  type IAccessibilityProps,
  type IAriaProps,
  type IKeyboardAvoidingBehavior,
  type IMeasuredFrame,
} from '@symbiote-native/components';
import {
  Keyboard,
  Platform,
  dlog,
  type IClassNameValue,
  type IEventSubscription,
  type IStyleProp,
  type ISymbioteEvent,
  type IViewStyle,
} from '@symbiote-native/engine';
import { View, type IViewProps } from './view';

export type { IKeyboardAvoidingBehavior } from '@symbiote-native/components';

// Declared here, not imported from @symbiote-native/components and never from another adapter:
// `children` is a Solid JSX.Element, which is exactly the test
// <prop_types_split_agnostic_vs_per_adapter> applies — the agnostic FIELD BASE
// (IAccessibilityProps / IAriaProps, IKeyboardAvoidingBehavior, IStyleProp, ISymbioteEvent) is
// shared, the framework-flavoured field is per-adapter. React's, Vue's and Svelte's
// IKeyboardAvoidingViewProps are separate declarations for the same reason.
//
// No `ref`: none of the reference adapters exposes one, and P0 parity is measured against React.
export interface IKeyboardAvoidingViewProps
  extends IAccessibilityProps, IAriaProps {
  behavior?: IKeyboardAvoidingBehavior;
  // When false, the view passes through untouched; no inset is applied in any behavior mode. RN
  // gates every inset/height computation on `enabled ?? true` (KeyboardAvoidingView.js), so only an
  // explicit `false` disables.
  enabled?: boolean;
  // Distance from the top of the screen to this view; subtracted from the keyboard's top edge so a
  // view that doesn't start at y=0 still clears the keyboard exactly.
  keyboardVerticalOffset?: number;
  // Style of the inner content container, used only when behavior is 'position'.
  contentContainerStyle?: IStyleProp<IViewStyle>;
  style?: IStyleProp<IViewStyle>;
  // Solid's own spelling for a registered class name — `class`, matching View and Pressable
  // (React's is `className`). Forwarded untouched onto the wrapper View, which resolves it through
  // the shared style registry. contentContainerStyle stays JS-only: it is a plain style object, not
  // style/class itself.
  class?: IClassNameValue;
  // Fires with the wrapper's measured frame. KAV intercepts it to feed the inset math and then
  // calls the caller's handler, so a consumer still sees every layout event.
  onLayout?: (event: ISymbioteEvent) => void;
  children?: JSX.Element;
}

// Read by KeyboardAvoidingView itself; everything else (the aria/role aliases, accessibility*,
// testID, class) forwards onto the wrapper View, which folds them once through
// resolveAccessibilityProps and widens the vanished-key case with withStableKeys.
const HANDLED_PROPS = [
  'behavior',
  'enabled',
  'keyboardVerticalOffset',
  'contentContainerStyle',
  'style',
  'onLayout',
  'children',
] as const;

export function KeyboardAvoidingView(
  props: IKeyboardAvoidingViewProps,
): JSX.Element {
  const [local, rest] = splitProps(props, HANDLED_PROPS);

  const [inset, setInset] = createSignal(0);
  // Plain variables, not signals: a re-measure alone must not repaint anything. They only feed the
  // NEXT keyboard event's math, which is what re-runs the layout memo. Same shape as React's
  // frameRef/initialHeightRef, Vue's `let frame` and Svelte's non-$state pair.
  let frame: IMeasuredFrame | undefined;
  let initialHeight: number | undefined;

  // A device accessibility setting, not state: it cannot change mid-session, and nothing should
  // repaint when the promise lands. So a plain `let` rather than a signal — the same reason `frame`
  // above is one. It is read at EVENT time, by which point the microtask has long resolved; a
  // keyboard event that somehow beat it just sees the `false` default, which is the ordinary math.
  //
  // Through the shared reader, not AccessibilityInfo directly: the engine's getter REJECTS on a
  // native error (RN parity), and nothing awaits this call, so a rejection here would surface as an
  // unhandled promise. readPrefersCrossFadeTransitions owns that fallback once for all five adapters
  // and answers false, which is also what a missing module and an Android host answer.
  let prefersCrossFadeTransitions = false;
  void readPrefersCrossFadeTransitions().then(enabled => {
    prefersCrossFadeTransitions = enabled;
  });

  const onShow = (payload: unknown): void => {
    const keyboard = readKeyboardFrame(payload);
    const offset = local.keyboardVerticalOffset ?? DEFAULT_VERTICAL_OFFSET;
    const next = computeInset(frame, keyboard, offset, {
      behavior: local.behavior,
      // The inset CURRENTLY applied (RN's this.state.bottom). Read from the signal at event time so
      // it is live: in 'height' mode the wrapper is SHRUNK by it, so the next onLayout reports a
      // frame shorter by exactly that much and core adds it back to cancel the shrink. Without it
      // each further keyboard event computes a smaller overlap and the view walks back down under
      // the keyboard. Core gates the correction on 'height'; the other modes ignore the value.
      previousInset: inset(),
      prefersCrossFadeTransitions,
    });
    dlog(`KeyboardAvoidingView show -> inset ${next}`);
    setInset(next);
  };
  const onHide = (): void => {
    dlog('KeyboardAvoidingView hide -> inset 0');
    setInset(0);
  };

  // TWO listeners, never three, and their names come from the host (RN KeyboardAvoidingView.js):
  // iOS takes the WILL pair so the view rides up with the keyboard animation instead of snapping
  // into place after it; Android has no will-notifications and keeps the DID pair. The change-frame
  // notification is deliberately absent — RN's own comment says an undocked, split or floating iOS
  // keyboard emits it BEFORE the hide, so listening to it applies a frame captured mid-dismissal.
  //
  // Subscribed in the setup body, which runs once per mount — Solid's counterpart to React's
  // mount-effect and Vue's onMounted. onCleanup runs on dispose (render.ts's teardown disposes the
  // whole root), so an unmount removes exactly the listeners this mount added; leaking them would
  // leave a dead closure calling setInset on a disposed signal on every keystroke.
  const events = keyboardAvoidingEventNamesFor(Platform.OS);
  const subscriptions: IEventSubscription[] = [
    Keyboard.addListener(events.show, onShow),
    Keyboard.addListener(events.hide, onHide),
  ];
  onCleanup(() => {
    for (const subscription of subscriptions) subscription.remove();
  });

  const handleLayout = (event: ISymbioteEvent): void => {
    const measured = readLayoutFrame(event.nativeEvent.layout);
    if (measured !== undefined) {
      frame = measured;
      if (initialHeight === undefined) initialHeight = measured.height;
    }
    local.onLayout?.(event);
  };

  const layout = createMemo(() =>
    resolveKeyboardAvoidingLayout({
      behavior: local.behavior,
      // When disabled the inset is forced to 0, so every behavior mode renders untouched. `inset()`
      // is not read at all on that branch, so a disabled KAV does not even subscribe to the signal;
      // re-enabling re-runs this memo through the `local.enabled` getter and picks the value up.
      effectiveInset: local.enabled === false ? 0 : inset(),
      initialHeight,
      style: local.style,
      contentContainerStyle: local.contentContainerStyle,
    }),
  );

  // What keeps the children alive across a keystroke. Solid has no reconciler between this file and
  // the host nodes — `insert` REPLACES a subtree (.claude/rules/solid-descriptor-bridge.md §4) — and
  // the branch below runs inside the wrapper's `insert` render effect. `layout()` returns a fresh
  // object on every keyboard event, so anything that lets it reach that effect tears the wrapped
  // subtree down and rebuilds it on every show/hide: typically the form the user is typing in, which
  // loses focus mid-keystroke. createMemo's default `===` equality stops the churn at the BOOLEAN —
  // it only notifies when the structure actually flips, i.e. when `behavior` moves in or out of
  // 'position'.
  //
  // babel-preset-solid's `wrapConditionals` (on by default) would memoize the condition of the
  // ternary below on its own, so the inline form happens to be safe too. Naming the memo makes that
  // guarantee local instead of a compiler flag nobody reads, and it survives the refactor that
  // actually breaks it — measured: moving the same branch into a plain `renderContent()` helper (the
  // shape Pressable uses) defeats wrapConditionals and rebuilds the subtree on every keyboard event.
  const isNested = createMemo(() => layout().kind === 'nested');

  // The inset reaches the host as a PROP instead: `spread` runs a per-key diff on the SAME element,
  // so nothing is rebuilt.
  const innerStyle = (): IStyleProp<IViewStyle> | undefined => {
    const resolved = layout();
    return resolved.kind === 'nested' ? resolved.innerStyle : undefined;
  };

  const wrapperProps = createMemo((): IViewProps => ({
    ...rest,
    style: layout().wrapperStyle,
    // Last, so KAV's own measure always runs; the caller's handler is invoked from inside it.
    onLayout: handleLayout,
  }));

  // 'nested' ('position') pushes the children in an inner View by `bottom: inset`; the wrapper modes
  // ('padding' / 'height' / no behavior) adjust the single wrapper directly.
  return (
    <View {...wrapperProps()}>
      {isNested() ? (
        <View style={innerStyle()}>{local.children}</View>
      ) : (
        local.children
      )}
    </View>
  );
}
