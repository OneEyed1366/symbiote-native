import { defineComponent } from 'vue';
import { Animated } from '@symbiote-native/vue';
import { FREEZE_MS } from './canary-shared';

const FADE_RANGE = [0, 120];
const ROWS = Array.from({ length: 6 }, (_value, index) => index);
const FREEZE_COLOR = '#fc8181';

const freezeJsThread = (): void => {
  const until = Date.now() + FREEZE_MS;
  while (Date.now() < until) {
    // Blocks on purpose: motion during the freeze can only come from the native driver
  }
};

// PASS: dragging the box fades and lifts the bar on the UI thread, with no per-frame JS
export const CanaryScrollHeader = defineComponent({
  name: 'CanaryScrollHeader',
  setup() {
    const scrollY = new Animated.Value(0);
    const opacity = scrollY.interpolate({ inputRange: FADE_RANGE, outputRange: [1, 0.12], extrapolate: 'clamp' });
    const translateY = scrollY.interpolate({ inputRange: FADE_RANGE, outputRange: [0, -16], extrapolate: 'clamp' });
    const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
      useNativeDriver: true,
    });
    return () => (
      <>
        <Animated.View class="parity-header" style={{ opacity, transform: [{ translateY }] }}>
          <text class="parity-header-text">HEADER — fades as you scroll ↓</text>
        </Animated.View>
        <Animated.ScrollView class="box-list160" nestedScrollEnabled scrollEventThrottle={16} onScroll={onScroll}>
          {ROWS.map(index => (
            <view key={index} class="scroll-demo-row">
              <text class="list-row-text">{`scroll me · row ${index}`}</text>
            </view>
          ))}
        </Animated.ScrollView>
        <text class="tiny-center">↑ drag inside the box — the bar above reacts</text>
        <button title="Freeze JS 3s — then scroll the box ↑" color={FREEZE_COLOR} onPress={freezeJsThread} />
        <text class="tiny-center">tap Freeze, then immediately drag the box — bar should still move</text>
      </>
    );
  },
});
