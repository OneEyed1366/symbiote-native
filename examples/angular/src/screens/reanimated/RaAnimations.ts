import { Component, signal } from '@angular/core';
import {
  SYMBIOTE_ELEMENTS,
  SymbioteHostPropsDirective,
} from '@symbiote-native/angular';
import {
  cancelAnimation,
  Easing,
  GentleSpringConfig,
  SnappySpringConfig,
  useAnimatedStyle,
  useSharedValue,
  WigglySpringConfig,
  withClamp,
  withDecay,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from '@symbiote-native/reanimated/angular';
import { ActionButton } from '../../components/ActionButton';
import { ACCENT, STOP_COLOR } from './colors';

const NEAR = 0;
const FAR = 200;
const CLAMP_AT = 120;
const TIMING_MS = 600;
const DECAY_VELOCITY = 900;
const REPEAT_FOREVER = -1;
const PAUSE_MS = 200;

type IPlay = (at: number) => number;

// The side of the track the box is not on
const otherSide = (at: number) => (at > FAR / 2 ? NEAR : FAR);

const PLAYS = {
  timing: at =>
    withTiming(otherSide(at), {
      duration: TIMING_MS,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    }),
  snappy: at => withSpring(otherSide(at), SnappySpringConfig),
  gentle: at => withSpring(otherSide(at), GentleSpringConfig),
  wiggly: at => withSpring(otherSide(at), WigglySpringConfig),
  decay: at =>
    withDecay({
      velocity: at > FAR / 2 ? -DECAY_VELOCITY : DECAY_VELOCITY,
      clamp: [NEAR, FAR],
    }),
  sequence: at =>
    withSequence(
      withTiming(otherSide(at), { duration: TIMING_MS }),
      withDelay(PAUSE_MS, withTiming(at, { duration: TIMING_MS })),
    ),
  repeat: at =>
    withRepeat(
      withTiming(otherSide(at), { duration: TIMING_MS }),
      REPEAT_FOREVER,
      true,
    ),
  clamp: at =>
    withClamp({ min: NEAR, max: CLAMP_AT }, withSpring(otherSide(at))),
} satisfies Record<string, IPlay>;

// A worklet closes over locals of its factory, as `this` does not cross to the UI runtime
function createBox() {
  const offset = useSharedValue<number>(NEAR);
  const slide = useAnimatedStyle(() => {
    'worklet';
    return { transform: [{ translateX: offset.value }] };
  });
  return { offset, props: { style: slide } };
}

// Timing, the spring presets, decay, sequence, repeat and clamp all drive this one box
@Component({
  selector: 'RaAnimations',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS, SymbioteHostPropsDirective],
  template: `
    <view class="ra-section">
      <text class="ra-section-title">Animations</text>
      <text class="ra-note"
        >timing, spring presets, decay, sequence, repeat and clamp on one shared
        value</text
      >
      <view class="ra-track">
        <view
          testID="ra-anim-box"
          class="ra-box"
          [symbioteHostProps]="box.props"
        ></view>
      </view>
      <text class="ra-note">last: {{ played() }}</text>
      <view class="ra-wrap">
        @for (entry of entries; track entry[0]) {
          <ActionButton
            [testID]="'ra-play-' + entry[0]"
            [title]="entry[0]"
            [color]="accent"
            (press)="play(entry[0], entry[1])"
          />
        }
        <ActionButton
          testID="ra-play-cancel"
          title="cancel"
          [color]="stopColor"
          (press)="stop()"
        />
      </view>
    </view>
  `,
})
export class RaAnimations {
  readonly box = createBox();
  readonly played = signal('nothing yet');
  readonly entries = Object.entries(PLAYS);
  readonly accent = ACCENT;
  readonly stopColor = STOP_COLOR;

  play(name: string, start: IPlay): void {
    this.box.offset.value = start(this.box.offset.value);
    this.played.set(name);
  }

  stop(): void {
    cancelAnimation(this.box.offset);
    this.played.set('cancel');
  }
}
