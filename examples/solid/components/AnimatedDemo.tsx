// Animated, both drivers side by side — and the freeze proof, which is the only reason this screen
// exists on Solid rather than being taken on trust.
//
// Solid updates an animated leaf through setNativeProps without touching its reactive graph, so a
// JS-driven animation here is fast enough to LOOK correct. Smoothness therefore proves nothing.
// The one convincing check is to kill the JS thread and see what keeps moving.
//
// The pulse runs on the NATIVE driver: the curve lives in NativeAnimated, so zero JS runs per frame
// (DEBUG shows a single `native: startAnimatingNode`, no per-frame commits). The two slide dots run
// the SAME timing on different drivers — the JS one commits a clone every frame (DEBUG logs
// `commit … incremental` ~60x/run), the native one offloads it. Each dot keeps its own
// Animated.Value so a JS run and a native run never touch the same node.

import {
  createSignal,
  onCleanup,
  onMount,
  type Accessor,
  type Setter,
} from 'solid-js';
import { Animated, Text, View } from '@symbiote-native/solid';
import { ActionButton } from './ActionButton';

const SLIDE_DISTANCE = 220;
const FREEZE_MS = 3_000;

export function AnimatedDemo() {
  // Plain consts, not React's useRef(...).current: a Solid component body runs exactly once, so
  // these already survive every later recompute.
  const pulse = new Animated.Value(0);
  const jsSlide = new Animated.Value(0);
  const nativeSlide = new Animated.Value(0);
  const [jsForward, setJsForward] = createSignal(false);
  const [nativeForward, setNativeForward] = createSignal(false);

  // A perpetual native-driven heartbeat, running from mount. It is the strongest half of the
  // freeze proof: it is already in flight when the thread dies, so nothing about starting an
  // animation mid-freeze can be blamed for the result.
  onMount(() => {
    // A SINGLE looping timing offloads entirely (iterations -1, zero JS per cycle); the 0->1 ramp
    // becomes a breathe in-and-out via the [0, 0.5, 1] interpolation, so no JS sequence is needed.
    const animation = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1400,
        useNativeDriver: true,
      }),
    );
    animation.start();
    onCleanup(() => animation.stop());
  });

  const pulseScale = pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.3, 1],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.4, 1, 0.4],
  });

  const slide = (
    value: typeof jsSlide,
    useNativeDriver: boolean,
    forward: Accessor<boolean>,
    setForward: Setter<boolean>,
  ): void => {
    Animated.timing(value, {
      toValue: forward() ? 0 : 1,
      duration: 600,
      useNativeDriver,
    }).start();
    setForward(current => !current);
  };

  const jsX = jsSlide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SLIDE_DISTANCE],
  });
  const nativeX = nativeSlide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SLIDE_DISTANCE],
  });

  // THE PROOF. Kick both slides, then block the JS thread solid for FREEZE_MS. Read the screen,
  // not the log:
  //   PASS — through the freeze the blue pulse keeps breathing and the GREEN dot slides across,
  //          while the ORANGE dot stands still and only jumps once the thread thaws.
  //   FAIL — everything stops together. The "native" path silently fell back to JS, so nothing is
  //          actually on the UI thread and every animation on this adapter is a JS animation.
  const freezeJs = (): void => {
    slide(jsSlide, false, jsForward, setJsForward);
    slide(nativeSlide, true, nativeForward, setNativeForward);
    const until = Date.now() + FREEZE_MS;
    while (Date.now() < until) {
      // Blocked on purpose: no requestAnimationFrame, no commit, no JS frame can run here.
    }
  };

  return (
    <View class="section-nested">
      <Text class="section-label">Animated · JS vs native driver</Text>

      {/* native-driven perpetual pulse */}
      <View class="pulse-frame">
        <Animated.View
          testID="pulse-dot"
          class="pulse-dot"
          style={{ opacity: pulseOpacity, transform: [{ scale: pulseScale }] }}
        />
      </View>

      {/* JS-driven slide: a commit per frame */}
      <View class="slide-track">
        <Animated.View
          testID="slide-js-dot"
          class="js-slide-dot"
          style={{ transform: [{ translateX: jsX }] }}
        />
      </View>
      <ActionButton
        testID="slide-js-btn"
        title="Slide (JS driver)"
        onPress={() => slide(jsSlide, false, jsForward, setJsForward)}
        color="#f6ad55"
      />

      {/* native-driven slide: offloaded, zero JS frames */}
      <View class="slide-track">
        <Animated.View
          testID="slide-native-dot"
          class="native-slide-dot"
          style={{ transform: [{ translateX: nativeX }] }}
        />
      </View>
      <ActionButton
        testID="slide-native-btn"
        title="Slide (native driver)"
        onPress={() =>
          slide(nativeSlide, true, nativeForward, setNativeForward)
        }
        color="#68d391"
      />

      <ActionButton
        testID="freeze-btn"
        title="Freeze JS 3s"
        onPress={freezeJs}
        color="#fc8181"
      />
    </View>
  );
}
