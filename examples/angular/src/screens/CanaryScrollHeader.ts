import { Component } from '@angular/core';
import {
  Animated,
  AnimatedScrollView,
  AnimatedView,
  SYMBIOTE_ELEMENTS,
} from '@symbiote-native/angular';
import { ActionButton } from '../components/ActionButton';
import { FREEZE_MS } from './canary-shared';

const FADE_RANGE = [0, 120];
const FREEZE_COLOR = '#fc8181';

// PASS: dragging the box fades and lifts the bar on the UI thread, with no per-frame JS.
// The style and props objects are stable fields: a literal in the template is a new reference on
// every change detection pass, which would rebuild the native binding on unrelated presses
@Component({
  selector: 'CanaryScrollHeader',
  standalone: true,
  imports: [ActionButton, AnimatedScrollView, AnimatedView, SYMBIOTE_ELEMENTS],
  template: `
    <AnimatedView
      testID="angular-parity-header"
      class="parity-header"
      [style]="headerStyle"
    >
      <text class="parity-header-text">HEADER — fades as you scroll ↓</text>
    </AnimatedView>
    <!-- onScroll goes through [animatedProps], the escape hatch for any Animated.event prop -->
    <AnimatedScrollView
      testID="angular-parity-scroll-box"
      class="box-list160"
      [animatedProps]="scrollProps"
    >
      @for (i of rows; track i) {
        <view class="scroll-demo-row">
          <text class="list-row-text">scroll me · row {{ i }}</text>
        </view>
      }
    </AnimatedScrollView>
    <text class="tiny-center"
      >↑ drag inside the box — the bar above reacts</text
    >
    <ActionButton
      testID="angular-freeze-js-scroll-btn"
      title="Freeze JS 3s — then scroll the box ↑"
      [color]="freezeColor"
      (press)="freezeJsThread()"
    />
    <text class="tiny-center"
      >tap Freeze, then immediately drag the box — bar should still move</text
    >
  `,
})
export class CanaryScrollHeader {
  readonly freezeColor = FREEZE_COLOR;
  readonly rows = Array.from({ length: 6 }, (_value, index) => index);

  private readonly scrollY = new Animated.Value(0);
  readonly headerStyle = {
    opacity: this.scrollY.interpolate({
      inputRange: FADE_RANGE,
      outputRange: [1, 0.12],
      extrapolate: 'clamp',
    }),
    transform: [
      {
        translateY: this.scrollY.interpolate({
          inputRange: FADE_RANGE,
          outputRange: [0, -16],
          extrapolate: 'clamp',
        }),
      },
    ],
  };
  readonly scrollProps = {
    onScroll: Animated.event(
      [{ nativeEvent: { contentOffset: { y: this.scrollY } } }],
      { useNativeDriver: true },
    ),
    scrollEventThrottle: 16,
    nestedScrollEnabled: true,
  };

  freezeJsThread(): void {
    const until = Date.now() + FREEZE_MS;
    while (Date.now() < until) {
      // Blocks on purpose: motion during the freeze can only come from the native driver
    }
  }
}
