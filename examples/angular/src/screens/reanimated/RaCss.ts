import { Component, computed, signal } from '@angular/core';
import {
  SYMBIOTE_ELEMENTS,
  SymbioteHostPropsDirective,
} from '@symbiote-native/angular';
import { css } from '@symbiote-native/reanimated/angular';
import { ActionButton } from '../../components/ActionButton';
import { NEXT_COLOR } from './colors';

const LIFT = -16;

// The same animation through the JS API: keyframes made once, a style that names them
const bounce = css.keyframes({
  from: { transform: [{ translateY: 0 }] },
  to: { transform: [{ translateY: LIFT }] },
});

const jsStyles = css.create({
  ball: {
    animationName: bounce,
    animationDuration: '600ms',
    animationDirection: 'alternate',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
  },
});

// CSS animations, transitions and states from a stylesheet, and the same through a style object
// Keyframes live in keyframes.css and in sections.css, and are shared between them
@Component({
  selector: 'RaCss',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS, SymbioteHostPropsDirective],
  template: `
    <view class="ra-section">
      <text class="ra-section-title">CSS</text>
      <text class="ra-note"
        >animation, transition, &#64;keyframes across files, onCSS callbacks,
        :active and :focus</text
      >
      <text class="ra-note"
        >keyframes from another file, and from this one</text
      >
      <view class="ra-row">
        <view testID="ra-css-spinner" class="ra-spinner"></view>
        <view testID="ra-css-pulse" class="ra-pulse"></view>
        <view
          testID="ra-css-ball"
          class="ra-ball"
          [symbioteHostProps]="ballProps"
        ></view>
      </view>

      <text class="ra-note"
        >transition on the width, and a callback when it ends</text
      >
      <view
        testID="ra-css-bar"
        [class]="barClass()"
        [symbioteHostProps]="barProps"
      ></view>
      <text class="ra-note">{{ endsNote() }}</text>
      <ActionButton
        testID="ra-css-toggle"
        title="toggle bar"
        [color]="nextColor"
        (press)="isLong.set(!isLong())"
      />

      <text class="ra-note">states of the node, served by Reanimated</text>
      <view testID="ra-css-press" class="ra-press">
        <text class="ra-press-text">press and hold</text>
      </view>
      <text-input
        testID="ra-css-field"
        class="ra-field"
        placeholder="focus me"
      ></text-input>
    </view>
  `,
})
export class RaCss {
  readonly isLong = signal(false);
  readonly ends = signal(0);
  readonly barClass = computed(() =>
    this.isLong() ? 'ra-bar ra-bar-long' : 'ra-bar ra-bar-short',
  );
  readonly endsNote = computed(() => `transitions ended: ${this.ends()}`);

  readonly ballProps = { style: jsStyles.ball };
  readonly barProps = {
    onCSSTransitionEnd: () => this.ends.update(count => count + 1),
  };
  readonly nextColor = NEXT_COLOR;
}
