import { useRef } from 'react';
import { Animated } from '@symbiote-native/react';
import { ActionButton } from '../components/ActionButton';
import { FREEZE_MS } from './canary-shared';

const FADE_RANGE = [0, 120];
const ROWS = Array.from({ length: 6 }, (_value, index) => index);
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
  const scrollY = useRef(new Animated.Value(0)).current;
  const opacity = scrollY.interpolate({ inputRange: FADE_RANGE, outputRange: [1, 0.12], extrapolate: 'clamp' });
  const translateY = scrollY.interpolate({ inputRange: FADE_RANGE, outputRange: [0, -16], extrapolate: 'clamp' });
  return (
    <>
      <Animated.View className="parity-header" style={{ opacity, transform: [{ translateY }] }}>
        <text className="parity-header-text">HEADER — fades as you scroll ↓</text>
      </Animated.View>
      <scroll-view
        nestedScrollEnabled
        className="box-list160"
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
      >
        {ROWS.map(index => (
          <view key={index} className="scroll-demo-row">
            <text className="list-row-text">{`scroll me · row ${index}`}</text>
          </view>
        ))}
      </scroll-view>
      <text className="tiny-center">↑ drag inside the box — the bar above reacts</text>
      <ActionButton title="Freeze JS 3s — then scroll the box ↑" color={FREEZE_COLOR} onPress={freezeJsThread} />
      <text className="tiny-center">tap Freeze, then immediately drag the box — bar should still move</text>
    </>
  );
}
