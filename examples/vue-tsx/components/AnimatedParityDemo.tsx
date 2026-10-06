import { defineComponent, onMounted, onUnmounted, ref } from 'vue';
import { Animated, PanResponder } from '@symbiote-native/vue';

const XY_SPAN = 96;
const FRAME_PADDING = 36;
const DRAG_MAX = XY_SPAN - 12;
const TRACK_DISTANCE = 200;
const HEADER_COLLAPSE = 60;
const SCROLL_STEP = 40;
const LEAD_MS = 700;
const SCROLL_MS = 180;
const TEAL = '#38b2ac';

// Drag the box, clamped inside its frame: each move is the resting position plus the gesture delta
function useDragBox() {
  const xy = new Animated.ValueXY({ x: 0, y: 0 });
  const resting = { x: 0, y: 0 };
  const clamp = (value: number): number => Math.max(0, Math.min(DRAG_MAX, value));
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_event, gesture) => {
      xy.setValue({ x: clamp(resting.x + gesture.dx), y: clamp(resting.y + gesture.dy) });
    },
    onPanResponderRelease: (_event, gesture) => {
      resting.x = clamp(resting.x + gesture.dx);
      resting.y = clamp(resting.y + gesture.dy);
    },
  });
  return { xy, panResponder };
}

// A follower spring-chases a lead value, so it lags instead of jumping
function useTracking() {
  const lead = new Animated.Value(0);
  const follow = new Animated.Value(0);
  const isForward = ref(false);
  onMounted(() => {
    Animated.spring(follow, { toValue: lead, useNativeDriver: false }).start();
  });
  onUnmounted(() => follow.stopAnimation());
  const moveLead = (): void => {
    Animated.timing(lead, {
      toValue: isForward.value ? 0 : TRACK_DISTANCE,
      duration: LEAD_MS,
      useNativeDriver: false,
    }).start();
    isForward.value = !isForward.value;
  };
  return { lead, follow, moveLead };
}

// A header that collapses as you scroll down and comes back as you scroll up
function useCollapsingHeader() {
  const scroll = new Animated.Value(0);
  let position = 0;
  const offset = Animated.diffClamp(scroll, 0, HEADER_COLLAPSE).interpolate({
    inputRange: [0, HEADER_COLLAPSE],
    outputRange: [0, -HEADER_COLLAPSE],
  });
  const scrollBy = (delta: number): void => {
    position = Math.max(0, position + delta);
    Animated.timing(scroll, { toValue: position, duration: SCROLL_MS, useNativeDriver: false }).start();
  };
  return { offset, scrollBy };
}

// The rest of the Animated surface: ValueXY, tracking and diffClamp
export const AnimatedParityDemo = defineComponent({
  name: 'AnimatedParityDemo',
  setup() {
    const { xy, panResponder } = useDragBox();
    const { lead, follow, moveLead } = useTracking();
    const { offset, scrollBy } = useCollapsingHeader();
    return () => (
      <view class="section-nested">
        <text class="section-label">Animated · ValueXY / tracking / diffClamp</text>
        <text class="drag-hint">drag the purple box →</text>
        {/* The size comes from a script const a CSS selector cannot read */}
        <view class="xy-frame" style={{ width: XY_SPAN + FRAME_PADDING, height: XY_SPAN + FRAME_PADDING }}>
          <Animated.View
            {...panResponder.panHandlers}
            class="xy-box"
            style={{ transform: xy.getTranslateTransform() }}
          />
        </view>
        <view class="track-row">
          <Animated.View class="lead-dot" style={{ transform: [{ translateX: lead }] }} />
        </view>
        <view class="track-row">
          <Animated.View testID="follow-dot" class="follow-dot" style={{ transform: [{ translateX: follow }] }} />
        </view>
        <button testID="track-btn" title="Move target (follower chases)" onPress={moveLead} color="#42b883" />
        <view class="collapse-frame" style={{ height: HEADER_COLLAPSE + 24 }}>
          <Animated.View
            class="collapse-header"
            style={{ height: HEADER_COLLAPSE, transform: [{ translateY: offset }] }}
          >
            <text class="collapse-header-text">collapsing header</text>
          </Animated.View>
        </view>
        <view class="row-tight">
          <view class="flex1">
            <button title="Scroll ↓" onPress={() => scrollBy(SCROLL_STEP)} color={TEAL} />
          </view>
          <view class="flex1">
            <button title="Scroll ↑" onPress={() => scrollBy(-SCROLL_STEP)} color={TEAL} />
          </view>
        </view>
      </view>
    );
  },
});
