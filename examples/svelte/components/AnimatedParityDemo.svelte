<script lang="ts">
  // The rest of the Animated surface: ValueXY (2D), tracking (chase a moving target),
  // and diffClamp (a collapsing header). Each is a thin port of the RN node.
  //
  // Animated.View is dotted, so it can't be a template tag — aliased to <AnimatedView>.
  // A JSX `{...panResponder.panHandlers}` spread stays a spread — Svelte 5 supports
  // `{...obj}` on components directly, no v-bind-style rewrite needed.
  import { View, Text, Animated, PanResponder } from '@symbiote-native/svelte';
  import ActionButton from './ActionButton.svelte';

  const AnimatedView = Animated.View;

  const XY_SPAN = 96;
  const TRACK_DISTANCE = 200;
  const HEADER_COLLAPSE = 60;

  // --- ValueXY + PanResponder: drag the box, clamped inside the frame --------
  // Track the resting position in a plain object; each move sets the absolute position
  // (resting + gesture delta) clamped to [0, DRAG_MAX] so the box can't leave the
  // frame. DRAG_MAX = inner width (XY_SPAN+36 - 6*2 padding) - box (36).
  const DRAG_MAX = XY_SPAN - 12;
  const xy = new Animated.ValueXY({ x: 0, y: 0 });
  const restingPos = { x: 0, y: 0 };
  const clamp = (n: number): number => Math.max(0, Math.min(DRAG_MAX, n));
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_event, gesture) => {
      xy.setValue({
        x: clamp(restingPos.x + gesture.dx),
        y: clamp(restingPos.y + gesture.dy),
      });
    },
    onPanResponderRelease: (_event, gesture) => {
      restingPos.x = clamp(restingPos.x + gesture.dx);
      restingPos.y = clamp(restingPos.y + gesture.dy);
    },
  });

  // --- Tracking: a follower spring-chases a lead value that animates on tap ---
  const lead = new Animated.Value(0);
  const follow = new Animated.Value(0);
  let leadForward = $state(false);

  // Set up once: follow tracks lead. Every lead change re-aims the spring, so the
  // follower lags and chases rather than jumping, the tracking signature. No reactive
  // dependency is read here, so this runs once on mount, cleanup once on unmount.
  $effect(() => {
    Animated.spring(follow, { toValue: lead, useNativeDriver: false }).start();
    return () => follow.stopAnimation();
  });

  const moveLead = (): void => {
    Animated.timing(lead, {
      toValue: leadForward ? 0 : TRACK_DISTANCE,
      duration: 700,
      useNativeDriver: false,
    }).start();
    leadForward = !leadForward;
  };

  // --- diffClamp: a header that collapses as you scroll down, reveals on up ---
  const scroll = new Animated.Value(0);
  let scrollPos = 0;
  const headerOffset = Animated.diffClamp(scroll, 0, HEADER_COLLAPSE).interpolate({
    inputRange: [0, HEADER_COLLAPSE],
    outputRange: [0, -HEADER_COLLAPSE],
  });
  const scrollBy = (delta: number): void => {
    scrollPos = Math.max(0, scrollPos + delta);
    Animated.timing(scroll, {
      toValue: scrollPos,
      duration: 180,
      useNativeDriver: false,
    }).start();
  };
</script>

<!-- Edge-to-edge markup between siblings: svelte-adapter-dom-shim skill §16. -->
<View class="section-nested"><Text class="section-label">Animated · ValueXY / tracking / diffClamp</Text><Text class="drag-hint">drag the purple box →</Text><View class="xy-frame"><AnimatedView
      {...panResponder.panHandlers}
      class="xy-box"
      style={{ transform: xy.getTranslateTransform() }}
    /></View><View class="track-row"><AnimatedView class="lead-dot" style={{ transform: [{ translateX: lead }] }} /></View><View class="track-row"><AnimatedView
      testID="follow-dot"
      class="follow-dot"
      style={{ transform: [{ translateX: follow }] }}
    /></View><ActionButton
    testID="track-btn"
    title="Move target (follower chases)"
    onPress={moveLead}
    color="#4299e1"
  /><View class="collapse-frame"><AnimatedView class="collapse-header" style={{ transform: [{ translateY: headerOffset }] }}><Text class="collapse-header-text">collapsing header</Text></AnimatedView></View><View class="row-tight"><View class="flex1"><ActionButton title="Scroll ↓" onPress={() => scrollBy(40)} color="#38b2ac" /></View><View class="flex1"><ActionButton title="Scroll ↑" onPress={() => scrollBy(-40)} color="#38b2ac" /></View></View></View>
