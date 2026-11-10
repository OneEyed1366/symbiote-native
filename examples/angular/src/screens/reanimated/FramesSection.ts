import { Component, signal } from '@angular/core';
import {
  SYMBIOTE_ELEMENTS,
  SymbioteHostPropsDirective,
} from '@symbiote-native/angular';
import {
  PerformanceMonitor,
  ReduceMotion,
  ReducedMotionConfig,
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  useTimestamp,
} from '@symbiote-native/reanimated/angular';
import { ActionButton } from '../../components/ActionButton';
import { ACCENT } from './colors';
import { KeyboardBox, SensorBox } from './DeviceBoxes';
import { Section } from './Section';

const DEGREES_PER_MS = 0.18;
const FULL_TURN = 360;

// A worklet closes over locals of its factory, as `this` does not cross to the UI runtime
function createFrames() {
  const angle = useSharedValue<number>(0);
  const timestamp = useTimestamp();
  const frozenAt = useSharedValue<number>(0);
  const isPaused = useSharedValue<boolean>(false);

  const frame = useFrameCallback(info => {
    'worklet';
    angle.value =
      (angle.value + (info.timeSincePreviousFrame ?? 0) * DEGREES_PER_MS) %
      FULL_TURN;
  });

  const turning = useAnimatedStyle(() => {
    'worklet';
    return { transform: [{ rotate: `${angle.value}deg` }] };
  });

  // `useTimestamp` reads its flag once, so a pause is applied to the readout instead
  const clock = useAnimatedProps(() => {
    'worklet';
    const shown = isPaused.value ? frozenAt.value : timestamp.value;
    return { text: `${Math.round(shown)} ms since the first frame` };
  });

  const setRunning = (isRunning: boolean) => {
    frozenAt.value = timestamp.value;
    isPaused.value = !isRunning;
    frame.setActive(isRunning);
  };

  return {
    setRunning,
    boxProps: { style: turning },
    clockProps: { editable: false, animatedProps: clock },
  };
}

// A frame callback that turns a box, a timestamp that counts, the reduced-motion switch, the
// performance monitor, and the two device-bound hooks behind a toggle each
@Component({
  selector: 'FramesSection',
  standalone: true,
  imports: [
    ActionButton,
    PerformanceMonitor,
    KeyboardBox,
    SensorBox,
    ReducedMotionConfig,
    Section,
    SYMBIOTE_ELEMENTS,
    SymbioteHostPropsDirective,
  ],
  template: `
    <Section
      title="Frames and sensors"
      note="useFrameCallback, useTimestamp, useReducedMotion, PerformanceMonitor, sensors and keyboard"
    >
      <ReducedMotionConfig [mode]="system" />
      <view class="ra-row">
        <view
          testID="ra-frame-box"
          class="ra-box"
          [symbioteHostProps]="frames.boxProps"
        ></view>
        <text-input
          testID="ra-frame-clock"
          class="ra-readout"
          [symbioteHostProps]="frames.clockProps"
        ></text-input>
      </view>
      <text class="ra-note">{{ reducedNote }}</text>
      <PerformanceMonitor />
      <view class="ra-wrap">
        <ActionButton
          testID="ra-frame-toggle"
          [title]="isRunning() ? 'pause' : 'resume'"
          [color]="accent"
          (press)="toggleRunning()"
        />
        <ActionButton
          testID="ra-sensor-toggle"
          [title]="isSensorShown() ? 'hide sensor' : 'show sensor'"
          [color]="accent"
          (press)="isSensorShown.set(!isSensorShown())"
        />
        <ActionButton
          testID="ra-keyboard-toggle"
          [title]="
            isKeyboardShown() ? 'hide keyboard box' : 'show keyboard box'
          "
          [color]="accent"
          (press)="isKeyboardShown.set(!isKeyboardShown())"
        />
      </view>
      @if (isSensorShown()) {
        <SensorBox />
      }
      @if (isKeyboardShown()) {
        <KeyboardBox />
      }
    </Section>
  `,
})
export class FramesSection {
  readonly frames = createFrames();
  readonly isRunning = signal(true);
  readonly isSensorShown = signal(false);
  readonly isKeyboardShown = signal(false);
  readonly reducedNote = `reduced motion: ${useReducedMotion() ? 'on' : 'off'}`;

  readonly system = ReduceMotion.System;
  readonly accent = ACCENT;

  toggleRunning(): void {
    this.frames.setRunning(!this.isRunning());
    this.isRunning.set(!this.isRunning());
  }
}
