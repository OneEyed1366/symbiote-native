// The rest of the Animated surface: ValueXY (2D), tracking (chase a moving target), and diffClamp
// (a collapsing header). Each is a thin port of the RN node — the graph itself is the engine's, so
// what this screen actually checks is that Solid's leaf wiring feeds it correctly.
//
// Everything held across recomputes is a plain const or a plain `let`, never a signal: a Solid
// component body runs once, and an engine node held in reactive state would be wrapped in a Proxy
// the engine's WeakMap mirror misses. Nothing here destructures props.

import { createSignal, onCleanup, onMount } from 'solid-js';
import { Animated, PanResponder, Text, View } from '@symbiote-native/solid';
import { ActionButton } from './ActionButton';

const XY_SPAN = 96;
const TRACK_DISTANCE = 200;
const HEADER_COLLAPSE = 60;

export function AnimatedParityDemo() {
  // --- ValueXY + PanResponder: drag the box, clamped inside the frame ---------------------
  // The resting position is a plain mutable object; each move sets the ABSOLUTE position
  // (resting + gesture delta) clamped to [0, DRAG_MAX] so the box can't leave the frame.
  // DRAG_MAX = inner width (XY_SPAN+36 - 6*2 padding) - box (36).
  const DRAG_MAX = XY_SPAN - 12;
  const xy = new Animated.ValueXY({ x: 0, y: 0 });
  let restingX = 0;
  let restingY = 0;
  const clamp = (n: number): number => Math.max(0, Math.min(DRAG_MAX, n));
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_event, gesture) => {
      xy.setValue({
        x: clamp(restingX + gesture.dx),
        y: clamp(restingY + gesture.dy),
      });
    },
    onPanResponderRelease: (_event, gesture) => {
      restingX = clamp(restingX + gesture.dx);
      restingY = clamp(restingY + gesture.dy);
    },
  });

  // --- Tracking: a follower spring-chases a lead value that animates on tap ----------------
  const lead = new Animated.Value(0);
  const follow = new Animated.Value(0);
  const [leadForward, setLeadForward] = createSignal(false);
  onMount(() => {
    // Set up once: follow tracks lead. Every lead change re-aims the spring, so the follower lags
    // and chases rather than jumping — the tracking signature.
    Animated.spring(follow, { toValue: lead, useNativeDriver: false }).start();
    onCleanup(() => follow.stopAnimation());
  });
  const moveLead = (): void => {
    Animated.timing(lead, {
      toValue: leadForward() ? 0 : TRACK_DISTANCE,
      duration: 700,
      useNativeDriver: false,
    }).start();
    setLeadForward(current => !current);
  };

  // --- diffClamp: a header that collapses as you scroll down, reveals on up ----------------
  const scroll = new Animated.Value(0);
  let scrollPos = 0;
  const headerOffset = Animated.diffClamp(
    scroll,
    0,
    HEADER_COLLAPSE,
  ).interpolate({
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

  return (
    <View class="section-nested">
      <Text class="section-label">
        Animated · ValueXY / tracking / diffClamp
      </Text>

      {/* ValueXY box you drag with a finger (PanResponder). panHandlers is a fixed bag of
          functions built once, so spreading it needs no accessor. */}
      <Text class="drag-hint">drag the purple box →</Text>
      <View class="xy-frame">
        <Animated.View
          {...panResponder.panHandlers}
          testID="xy-box"
          class="xy-box"
          style={{ transform: xy.getTranslateTransform() }}
        />
      </View>

      {/* Tracking: lead dot (blue) and follower (orange) that lags behind it */}
      <View class="track-row">
        <Animated.View
          class="lead-dot"
          style={{ transform: [{ translateX: lead }] }}
        />
      </View>
      <View class="track-row">
        <Animated.View
          testID="follow-dot"
          class="follow-dot"
          style={{ transform: [{ translateX: follow }] }}
        />
      </View>
      <ActionButton
        testID="track-btn"
        title="Move target (follower chases)"
        onPress={moveLead}
        color="#4299e1"
      />

      {/* diffClamp collapsing header */}
      <View class="collapse-frame">
        <Animated.View
          class="collapse-header"
          style={{ transform: [{ translateY: headerOffset }] }}
        >
          <Text class="collapse-header-text">collapsing header</Text>
        </Animated.View>
      </View>
      <View class="row-tight">
        <View class="flex1">
          <ActionButton
            title="Scroll ↓"
            onPress={() => scrollBy(40)}
            color="#38b2ac"
          />
        </View>
        <View class="flex1">
          <ActionButton
            title="Scroll ↑"
            onPress={() => scrollBy(-40)}
            color="#38b2ac"
          />
        </View>
      </View>
    </View>
  );
}
