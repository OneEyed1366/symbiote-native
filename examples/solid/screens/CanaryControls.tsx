import { createSignal } from 'solid-js';
import { Slider } from '@symbiote-native/slider/solid';
import { LINE_COLOR } from '../navigation-lines';
import { INPUT_HINT, TRACK_OFF } from './canary-shared';

const COLOR = LINE_COLOR.primitives;

export function CanaryCounter(props: { count: number; onTap: () => void }) {
  return (
    <view testID="counter-card" onPress={props.onTap} class="counter-card">
      <text testID="counter-value" class="counter-text">
        {`tapped ${props.count}×`}
      </text>
    </view>
  );
}

// Shares the text-input tag with the keyboard-avoiding email field further down
export function CanaryGreeting() {
  const [name, setName] = createSignal('');
  return (
    <>
      <text-input
        testID="greeting-input"
        value={name()}
        onValueChange={event => setName(event.text)}
        placeholder="type your name…"
        placeholderTextColor={INPUT_HINT}
        class="text-input"
      />
      <text testID="greeting-output" class="greeting">
        {name() ? `Hello, ${name()}` : 'Hello, stranger'}
      </text>
    </>
  );
}

// The switch drives the ActivityIndicator below it
export function CanarySpinner() {
  const [isSpinning, setIsSpinning] = createSignal(true);
  return (
    <>
      <view class="switch-row">
        <text class="switch-label">spinner</text>
        <switch
          testID="spinner-switch"
          value={isSpinning()}
          onValueChange={event => setIsSpinning(event.value)}
          trackColor={{ false: TRACK_OFF, true: COLOR }}
        />
      </view>
      <activity-indicator testID="spinner-indicator" animating={isSpinning()} color={COLOR} size="large" />
    </>
  );
}

// Built in, no native module: the box and the checkmark are views
export function CanaryCheckbox() {
  const [isChecked, setIsChecked] = createSignal(false);
  return (
    <view class="switch-row">
      <text class="switch-label">{isChecked() ? 'checkbox · checked' : 'checkbox · unchecked'}</text>
      <checkbox
        testID="canary-checkbox"
        value={isChecked()}
        onValueChange={event => setIsChecked(event.value)}
        color={COLOR}
      />
    </view>
  );
}

// A third-party native view through the wrapper: the engine derives its events and tints
export function CanaryVolume() {
  const [volume, setVolume] = createSignal(0.5);
  return (
    <view class="section-tight">
      <text class="switch-label">{`volume · ${Math.round(volume() * 100)}%`}</text>
      <Slider
        value={volume()}
        onValueChange={setVolume}
        minimumValue={0}
        maximumValue={1}
        step={0.01}
        minimumTrackTintColor={COLOR}
        maximumTrackTintColor={TRACK_OFF}
        thumbTintColor="#ffffff"
        class="slider"
      />
    </view>
  );
}

// Static look in .pressable-card. A bare tag has no render prop, so the label follows press events
export function CanaryPressable(props: { onTap: () => void }) {
  const [isPressed, setIsPressed] = createSignal(false);
  return (
    <pressable
      onPress={props.onTap}
      onPressIn={() => setIsPressed(true)}
      onPressOut={() => setIsPressed(false)}
      class="pressable-card"
      style={state => ({
        backgroundColor: state.pressed ? '#0b1020' : '#151c33',
        borderColor: COLOR,
      })}
    >
      <text class="pressable-label" style={{ color: isPressed() ? COLOR : '#9aa6c4' }}>
        {isPressed() ? 'holding…' : 'press me (also +1)'}
      </text>
    </pressable>
  );
}
