import { For } from 'solid-js';
import { Animated } from '@symbiote-native/solid';
import { ActionButton } from '../components/ActionButton';
import { FREEZE_MS } from './canary-shared';

const FADE_RANGE = [0, 120];
const SCROLL_ROWS: ReadonlyArray<number> = Array.from({ length: 6 }, (_value, index) => index);
const FREEZE_COLOR = '#fc8181';

function freezeJsThread(): void {
  const until = Date.now() + FREEZE_MS;
  while (Date.now() < until) {
    // Blocks on purpose: motion during the freeze can only come from the native driver
  }
}

// PASS: dragging the box fades and lifts the bar on the UI thread, with no per-frame JS.
// Animated.event binds natively on any host node, there is no Animated.ScrollView
export function CanaryScrollHeader() {
  const scrollY = new Animated.Value(0);
  const opacity = scrollY.interpolate({ inputRange: FADE_RANGE, outputRange: [1, 0.12], extrapolate: 'clamp' });
  const translateY = scrollY.interpolate({ inputRange: FADE_RANGE, outputRange: [0, -16], extrapolate: 'clamp' });
  return (
    <>
      <view class="parity-header" style={{ opacity, transform: [{ translateY }] }}>
        <text class="parity-header-text">HEADER — fades as you scroll ↓</text>
      </view>
      <scroll-view
        nestedScrollEnabled
        class="box-list160"
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
      >
        <For each={SCROLL_ROWS}>
          {index => (
            <view class="scroll-demo-row">
              <text class="list-row-text">{`scroll me · row ${index}`}</text>
            </view>
          )}
        </For>
      </scroll-view>
      <text class="tiny-center">↑ drag inside the box — the bar above reacts</text>
      <ActionButton title="Freeze JS 3s — then scroll the box ↑" color={FREEZE_COLOR} onPress={freezeJsThread} />
      <text class="tiny-center">tap Freeze, then immediately drag the box — bar should still move</text>
    </>
  );
}
