<script lang="ts">
  // Animated, both drivers side by side. The pulse runs on the NATIVE driver: the curve lives in
  // NativeAnimated, so zero JS runs per frame (DEBUG shows a single `native: startAnimatingNode`,
  // no per-frame commits). The two slide dots run the SAME timing on different drivers: the JS
  // one commits a clone every frame (DEBUG logs `commit … incremental` ~60x/run), the native one
  // offloads it. Each dot keeps its own Animated.Value so a JS run and a native run never touch
  // the same node.
  //
  // Animated.View is dotted, so it can't be a template tag — aliased to <AnimatedView>.
  import { View, Text, Animated } from '@symbiote-native/svelte';
  import ActionButton from './ActionButton.svelte';

  const AnimatedView = Animated.View;

  const SLIDE_DISTANCE = 220;

  // A top-level script const runs once per component instance — Svelte doesn't need
  // useRef's "survive re-render" trick.
  const pulse = new Animated.Value(0);
  const jsSlide = new Animated.Value(0);
  const nativeSlide = new Animated.Value(0);
  let jsForward = $state(false);
  let nativeForward = $state(false);

  // A perpetual native-driven heartbeat. A SINGLE looping timing offloads entirely
  // to native (iterations -1, zero JS per cycle); the 0->1 ramp becomes a breathe
  // in-and-out via the [0, 0.5, 1] interpolation, so no JS sequence is needed. No
  // reactive dependency is read here, so this $effect runs exactly once on mount and
  // its cleanup exactly once on unmount — the Svelte twin of useEffect(fn, [pulse]).
  $effect(() => {
    const animation = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1400,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
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
    forward: boolean,
    setForward: (next: boolean) => void,
    useNativeDriver: boolean,
  ): void => {
    Animated.timing(value, {
      toValue: forward ? 0 : 1,
      duration: 600,
      useNativeDriver,
    }).start();
    setForward(!forward);
  };

  const jsX = jsSlide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SLIDE_DISTANCE],
  });
  const nativeX = nativeSlide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SLIDE_DISTANCE],
  });

  // Proof of offload (ADR 0017): kick both slides, then jam the JS thread for 1.5s.
  // The native-driven pulse + green slide keep moving on the UI side through the
  // freeze; the JS-driven orange slide stalls until the thread is released. If the
  // "native" path had silently fallen back to JS, the pulse would freeze too.
  const freezeJs = (): void => {
    slide(jsSlide, jsForward, next => (jsForward = next), false);
    slide(nativeSlide, nativeForward, next => (nativeForward = next), true);
    const until = Date.now() + 1500;
    while (Date.now() < until) {
      // Intentionally block the JS thread: no requestAnimationFrame can fire here.
    }
  };
</script>

<!-- Edge-to-edge markup between siblings: svelte-adapter-dom-shim skill §16. -->
<View class="section-nested"
  ><Text class="section-label">Animated · JS vs native driver</Text><View
    class="pulse-frame"
    ><AnimatedView
      testID="pulse-dot"
      class="pulse-dot"
      style={{ opacity: pulseOpacity, transform: [{ scale: pulseScale }] }}
    /></View
  ><View class="slide-track"
    ><AnimatedView
      testID="slide-js-dot"
      class="js-slide-dot"
      style={{ transform: [{ translateX: jsX }] }}
    /></View
  ><ActionButton
    testID="slide-js-btn"
    title="Slide (JS driver)"
    onPress={() => slide(jsSlide, jsForward, next => (jsForward = next), false)}
    color="#f6ad55"
  /><View class="slide-track"
    ><AnimatedView
      testID="slide-native-dot"
      class="native-slide-dot"
      style={{ transform: [{ translateX: nativeX }] }}
    /></View
  ><ActionButton
    testID="slide-native-btn"
    title="Slide (native driver)"
    onPress={() =>
      slide(nativeSlide, nativeForward, next => (nativeForward = next), true)}
    color="#68d391"
  /><ActionButton
    title="Freeze JS 1.5s"
    onPress={freezeJs}
    color="#fc8181"
  /></View
>
