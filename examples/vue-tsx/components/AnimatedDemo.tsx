import { defineComponent, onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import { Animated } from '@symbiote-native/vue';

const SLIDE_DISTANCE = 220;
const PULSE_MS = 1_400;
const SLIDE_MS = 600;
const FREEZE_MS = 1_500;
const HALF_RANGE = [0, 0.5, 1];
const SLIDE_RANGE = [0, SLIDE_DISTANCE];

// The pulse runs on the native driver, the two slide dots run one timing on different drivers.
// Each dot has its own Animated.Value so a JS run and a native run never touch the same node
export const AnimatedDemo = defineComponent({
  name: 'AnimatedDemo',
  setup() {
    const pulse = new Animated.Value(0);
    const jsSlide = new Animated.Value(0);
    const nativeSlide = new Animated.Value(0);
    const isJsForward = ref(false);
    const isNativeForward = ref(false);

    // One looping timing offloads entirely to native: zero JS per cycle
    const heartbeat = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: PULSE_MS, useNativeDriver: true }),
    );
    onMounted(() => heartbeat.start());
    onUnmounted(() => heartbeat.stop());

    const pulseScale = pulse.interpolate({ inputRange: HALF_RANGE, outputRange: [1, 1.3, 1] });
    const pulseOpacity = pulse.interpolate({ inputRange: HALF_RANGE, outputRange: [0.4, 1, 0.4] });
    const jsX = jsSlide.interpolate({ inputRange: [0, 1], outputRange: SLIDE_RANGE });
    const nativeX = nativeSlide.interpolate({ inputRange: [0, 1], outputRange: SLIDE_RANGE });

    const slide = (value: typeof jsSlide, isForward: Ref<boolean>, useNativeDriver: boolean): void => {
      Animated.timing(value, {
        toValue: isForward.value ? 0 : 1,
        duration: SLIDE_MS,
        useNativeDriver,
      }).start();
      isForward.value = !isForward.value;
    };

    // Proof of offload: the native pulse and slide keep moving through the freeze, the JS slide stalls
    const freezeJs = (): void => {
      slide(jsSlide, isJsForward, false);
      slide(nativeSlide, isNativeForward, true);
      const until = Date.now() + FREEZE_MS;
      while (Date.now() < until) {
        // Blocks on purpose: no requestAnimationFrame can fire here
      }
    };

    return () => (
      <view class="section-nested">
        <text class="section-label">Animated · JS vs native driver</text>
        <view class="pulse-frame">
          <Animated.View
            testID="pulse-dot"
            class="pulse-dot"
            style={{ opacity: pulseOpacity, transform: [{ scale: pulseScale }] }}
          />
        </view>
        <view class="slide-track">
          <Animated.View testID="slide-js-dot" class="js-slide-dot" style={{ transform: [{ translateX: jsX }] }} />
        </view>
        <button
          testID="slide-js-btn"
          title="Slide (JS driver)"
          onPress={() => slide(jsSlide, isJsForward, false)}
          color="#f6ad55"
        />
        <view class="slide-track">
          <Animated.View
            testID="slide-native-dot"
            class="native-slide-dot"
            style={{ transform: [{ translateX: nativeX }] }}
          />
        </view>
        <button
          testID="slide-native-btn"
          title="Slide (native driver)"
          onPress={() => slide(nativeSlide, isNativeForward, true)}
          color="#68d391"
        />
        <button title="Freeze JS 1.5s" onPress={freezeJs} color="#fc8181" />
      </view>
    );
  },
});
