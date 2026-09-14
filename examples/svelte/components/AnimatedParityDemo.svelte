<script lang="ts">
  // The rest of the Animated surface: ValueXY (2D), tracking (chase a moving target),
  // and diffClamp (a collapsing header). Each is a thin port of the RN node.
  //
  // A JSX `{...panResponder.panHandlers}` spread does NOT survive on a host TAG: Svelte's
  // spread path drops a handler's return value, which the responder negotiation needs. The bag
  // (`p={…}`) is the tag's own channel and keeps it — see the markup below.
  import { Animated, PanResponder } from '@symbiote-native/svelte';
  import ActionButton from './ActionButton.svelte';

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
</script>

<view class="section-nested">
  <text class="section-label">Animated · ValueXY / tracking / diffClamp</text>
  <text class="drag-hint">drag the purple box →</text>
  <view class="xy-frame">
    <!-- `p={…}`, not `{...panHandlers}`. Svelte compiles a spread on an ELEMENT to
         `attribute_effect` -> `set_attributes`, which wraps every `on*` value in a handler that
         calls the original and DROPS ITS RETURN VALUE (attributes.js:423). That is harmless for a
         DOM event and fatal here: the responder negotiation reads
         `onStartShouldSetResponder`'s answer, so a spread box asks for the gesture and is never
         heard. The bag channel keeps the return; so does a named attribute. -->
    <view
      p={panResponder.panHandlers}
      class="xy-box"
      style={{ transform: xy.getTranslateTransform() }}
    />
  </view>
  <view class="track-row">
    <view class="lead-dot" style={{ transform: [{ translateX: lead }] }} />
  </view>
  <view class="track-row">
    <view
      testID="follow-dot"
      class="follow-dot"
      style={{ transform: [{ translateX: follow }] }}
    />
  </view>
  <ActionButton
    testID="track-btn"
    title="Move target (follower chases)"
    onPress={moveLead}
    color="#4299e1"
  />
  <view class="collapse-frame">
    <view
      class="collapse-header"
      style={{ transform: [{ translateY: headerOffset }] }}
    >
      <text class="collapse-header-text">collapsing header</text>
    </view>
  </view>
  <view class="row-tight">
    <view class="flex1">
      <ActionButton
        title="Scroll ↓"
        onPress={() => scrollBy(40)}
        color="#38b2ac"
      />
    </view>
    <view class="flex1">
      <ActionButton
        title="Scroll ↑"
        onPress={() => scrollBy(-40)}
        color="#38b2ac"
      />
    </view>
  </view>
</view>
