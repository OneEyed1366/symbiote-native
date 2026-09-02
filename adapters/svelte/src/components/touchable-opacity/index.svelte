<script lang="ts" module>
  // TouchableOpacity: built on Pressable, like the rest of the family. Ported against RN's own
  // source (.vendors/react-native/.../Components/Touchable/TouchableOpacity.js) after the
  // 2026-08-19 audit found ten divergences shared by every adapter; Solid migrated first, then
  // React, Vue and Angular, and this is Svelte.
  //
  // Shared (framework-agnostic) half: the press-scheduling machine and the resting-opacity math
  // (@symbiote-native/components). Svelte owns only the lifecycle — runes, the real timers, and
  // the Animated wiring.
  //
  // The interim `tweenOpacity` stand-in this file used to carry is GONE. Its header claimed no
  // Animated binding existed for this adapter; that stopped being true when
  // modules/animated landed, and a setTimeout tween can never be native-driven — which is
  // exactly what RN asks for here (useNativeDriver: true, TouchableOpacity.js:242).
  import type { ITouchableOpacityProps } from './touchable-opacity-props';
  import View from '../View.svelte';
  import { createAnimatedComponent } from '../../modules/animated/create-animated-component';

  export type { ITouchableOpacityProps };

  // Wrapped here, not imported from modules/animated: that barrel pulls in six `.svelte`
  // components (View/Text/Image/ScrollView/FlatList/SectionList), and this package's vitest has
  // no `.svelte` loader — a smoke test would have to pre-compile the whole tree to reach one
  // Animated.View. Same reasoning, different cause, as sticky-header.svelte's own local wrap.
  // Module scope, so every TouchableOpacity instance shares one component identity.
  const AnimatedView = createAnimatedComponent(View);
</script>

<script lang="ts">
  import {
    createTouchableFeedbackHandlers,
    createTouchableFeedbackRuntime,
    DEFAULT_ACTIVE_OPACITY,
    OPACITY_ACTIVE_GRANT_DURATION_MS,
    OPACITY_INACTIVE_DURATION_MS,
    TOUCHABLE_MIN_PRESS_DURATION_MS,
    restingOpacityFromStyle,
  } from '@symbiote-native/components';
  import {
    AnimatedMock,
    AnimatedValue,
    Easing,
    Platform,
    dlog,
    timing,
    type ISymbioteEvent,
  } from '@symbiote-native/engine';
  import Pressable from '../pressable/index.svelte';

  // modules/animated's barrel swaps the WHOLE driver namespace for the mock when the host
  // reports reduced motion; reaching it here would close the import the module block above
  // avoids, so the one driver this component uses is swapped locally on the same flag.
  const startTiming = Platform.isDisableAnimations
    ? AnimatedMock.timing
    : timing;

  function scheduleTimeout(callback: () => void, ms: number): () => void {
    const id = setTimeout(callback, ms);
    return () => clearTimeout(id);
  }

  let {
    activeOpacity = DEFAULT_ACTIVE_OPACITY,
    style,
    class: className,
    children: content,
    onPressIn,
    onPressOut,
    delayPressIn = 0,
    delayPressOut = 0,
    // RN's Touchables override Pressability's own 130ms floor with 0 (TouchableOpacity.js:195);
    // what holds the active visual is the fade's duration, not a press-duration floor.
    minPressDuration = TOUCHABLE_MIN_PRESS_DURATION_MS,
    ...rest
  }: ITouchableOpacityProps = $props();

  // RN's _getChildStyleOpacityWithDefault: the fade settles at the opacity the CALLER's style
  // asks for, not at a hard 1.
  const restingOpacity = $derived(restingOpacityFromStyle(style));

  // One Animated.Value per mount, held by IDENTITY in a plain `const` — never `$state`, which
  // would deep-proxy an engine object whose graph bookkeeping is keyed on the raw instance
  // (same concern as Pressable's `$state.raw` hostShim).
  // svelte-ignore state_referenced_locally -- the SEED is a one-shot read of the initial style;
  // later changes are re-settled by the update effect below, not by re-seeding.
  const opacity = new AnimatedValue(restingOpacity);

  // Setup-scope only, mutated by the machine — same as Pressable's own runtime, never `$state`.
  const runtime = createTouchableFeedbackRuntime();

  function setOpacityTo(toValue: number, duration: number): void {
    dlog(`TouchableOpacity opacity -> ${toValue} over ${duration}ms`);
    // useNativeDriver: true is RN's own (TouchableOpacity.js:242). opacity is natively drivable,
    // so the fade survives a busy JS thread — the whole point of press feedback.
    startTiming(opacity, {
      toValue,
      duration,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start();
  }

  // Rebuilt whenever the timing config changes (mirrors Vue's per-render rebuild); the runtime
  // persists across rebuilds so an in-flight delayPressIn timer / activation clock survives.
  const handlers = $derived(
    createTouchableFeedbackHandlers(
      {
        delayPressIn,
        delayPressOut,
        minPressDuration,
        schedule: scheduleTimeout,
        now: Date.now,
      },
      runtime,
      {
        activate(event: ISymbioteEvent): void {
          // 0, not 150 (TouchableOpacity.js:215-220): the duration is chosen by where the
          // press-in came from, and Pressability re-dispatches the GRANT event as the delay
          // signal when delayPressIn is 0 — so an ordinary tap darkens instantly in RN. The 150ms
          // branch is a re-activation (finger returning inside after leaving the bounds), which
          // our engine never emits — it sends pressIn from one place, on topTouchStart.
          setOpacityTo(activeOpacity, OPACITY_ACTIVE_GRANT_DURATION_MS);
          onPressIn?.(event);
        },
        deactivate(event: ISymbioteEvent): void {
          setOpacityTo(restingOpacity, OPACITY_INACTIVE_DURATION_MS);
          onPressOut?.(event);
        },
      },
    ),
  );

  // Two SEPARATE deriveds, not one object: each memoizes by value, so an unrelated prop change
  // cannot re-settle the opacity — the Svelte form of Vue's deliberate two-getter watch source.
  const disabledInput = $derived(rest.disabled);

  // RN's componentDidUpdate: a changed `disabled` or a changed style opacity re-settles the view,
  // so a Touchable disabled mid-press does not stay stuck at its active opacity. The first run is
  // skipped — RN does this on UPDATE only, and firing at mount would animate over the value the
  // Animated.Value was just seeded with.
  let settled: { disabled: unknown; resting: number } | undefined;
  $effect(() => {
    const current = { disabled: disabledInput, resting: restingOpacity };
    const previous = settled;
    settled = current;
    if (previous === undefined) return;
    if (
      previous.disabled === current.disabled &&
      previous.resting === current.resting
    ) {
      return;
    }
    setOpacityTo(current.resting, OPACITY_INACTIVE_DURATION_MS);
  });

  // RN's componentWillUnmount: stop the animation and drop the value back, so a teardown
  // mid-fade leaves no driver running against a node that is gone.
  $effect(() => {
    return () => {
      opacity.resetAnimation();
    };
  });

  // Depends on `style` alone. `opacity` is a stable graph node, so a press changes what the node
  // HOLDS, never this array — the per-frame path is setValue -> AnimatedProps.update ->
  // setNativeProps, which never re-renders this component.
  const feedbackStyle = $derived([style, { opacity }]);
</script>

<Pressable
  __minPressDuration={0}
  {...rest}
  onPressIn={handlers.handlePressIn}
  onPressOut={handlers.handlePressOut}
>
  {#snippet children()}
    <AnimatedView style={feedbackStyle} class={className}>
      {@render content?.()}
    </AnimatedView>
  {/snippet}
</Pressable>
