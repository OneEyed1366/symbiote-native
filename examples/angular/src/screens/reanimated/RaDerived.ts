import { Component, computed, signal } from '@angular/core';
import {
  SYMBIOTE_ELEMENTS,
  SymbioteHostPropsDirective,
} from '@symbiote-native/angular';
import {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from '@symbiote-native/reanimated/angular';
import { scheduleOnRN } from 'react-native-worklets';
import { ActionButton } from '../../components/ActionButton';
import { GO_COLOR } from './colors';

const DONE = 1;
const START = 0;
const RUN_MS = 1_500;
const QUARTERS = 4;
const FULL_TURN = 360;
const MAX_SCALE = 1.4;
const FROM_COLOR = '#4ea1ff';
const TO_COLOR = '#ff7a59';

// A worklet closes over locals of its factory, as `this` does not cross to the UI runtime
function createProgress(setQuarter: (now: number) => void) {
  const progress = useSharedValue<number>(START);

  const angle = useDerivedValue(() => {
    'worklet';
    return interpolate(
      progress.value,
      [START, DONE],
      [0, FULL_TURN],
      Extrapolation.CLAMP,
    );
  });

  const look = useAnimatedStyle(() => {
    'worklet';
    return {
      backgroundColor: interpolateColor(
        progress.value,
        [START, DONE],
        [FROM_COLOR, TO_COLOR],
      ),
      transform: [
        { rotate: `${angle.value}deg` },
        {
          scale: interpolate(
            progress.value,
            [START, DONE],
            [1, MAX_SCALE],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  useAnimatedReaction(
    () => {
      'worklet';
      return Math.min(Math.floor(progress.value * QUARTERS), QUARTERS - 1);
    },
    (now, before) => {
      'worklet';
      if (now !== before) scheduleOnRN(setQuarter, now);
    },
  );

  const readout = useAnimatedProps(() => {
    'worklet';
    return { text: `${Math.round(progress.value * 100)}%` };
  });

  return {
    progress,
    boxProps: { style: look },
    readoutProps: {
      editable: false,
      defaultValue: '0%',
      animatedProps: readout,
    },
  };
}

// One progress value feeds a derived angle, an interpolated colour and scale, a reaction that
// reports to the JS thread, and a `text` prop written straight to a native TextInput
@Component({
  selector: 'RaDerived',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS, SymbioteHostPropsDirective],
  template: `
    <view class="ra-section">
      <text class="ra-section-title">Derived values and animated props</text>
      <text class="ra-note"
        >useDerivedValue, interpolate, interpolateColor, useAnimatedReaction and
        useAnimatedProps</text
      >
      <view class="ra-row">
        <view
          testID="ra-derived-box"
          class="ra-box"
          [symbioteHostProps]="derived.boxProps"
        ></view>
        <text-input
          testID="ra-derived-readout"
          class="ra-readout"
          [symbioteHostProps]="derived.readoutProps"
        ></text-input>
      </view>
      <text class="ra-note">{{ quarterNote() }}</text>
      <ActionButton
        testID="ra-derived-run"
        title="run"
        [color]="goColor"
        (press)="run()"
      />
    </view>
  `,
})
export class RaDerived {
  readonly quarter = signal(0);
  readonly derived = createProgress(now => this.quarter.set(now));
  readonly quarterNote = computed(
    () => `reaction saw quarter ${this.quarter() + 1} of ${QUARTERS}`,
  );
  readonly goColor = GO_COLOR;

  run(): void {
    const { progress } = this.derived;
    progress.value = withTiming(progress.value > DONE / 2 ? START : DONE, {
      duration: RUN_MS,
    });
  }
}
