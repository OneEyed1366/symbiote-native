import { useState } from 'react';
import { Slider } from '@symbiote-native/slider/react';
import { LINE_COLOR } from '../navigation-lines';
import { INPUT_HINT, TRACK_OFF } from './canary-shared';

const COLOR = LINE_COLOR.primitives;

export function CanaryCounter({ count, onTap }: { count: number; onTap: () => void }) {
  return (
    <view testID="counter-card" onPress={onTap} className="counter-card">
      <text testID="counter-value" className="counter-text">
        {`tapped ${count}×`}
      </text>
    </view>
  );
}

// Shares the text-input tag with the keyboard-avoiding email field further down
export function CanaryGreeting() {
  const [name, setName] = useState('');
  return (
    <>
      <text-input
        testID="greeting-input"
        value={name}
        onValueChange={event => setName(event.text)}
        placeholder="type your name…"
        placeholderTextColor={INPUT_HINT}
        className="text-input"
      />
      <text testID="greeting-output" className="greeting">
        {name ? `Hello, ${name}` : 'Hello, stranger'}
      </text>
    </>
  );
}

// The switch drives the ActivityIndicator below it
export function CanarySpinner() {
  const [isSpinning, setIsSpinning] = useState(true);
  return (
    <>
      <view className="switch-row">
        <text className="switch-label">spinner</text>
        <switch
          testID="spinner-switch"
          value={isSpinning}
          onValueChange={event => setIsSpinning(event.value)}
          trackColor={{ false: TRACK_OFF, true: COLOR }}
        />
      </view>
      <activity-indicator testID="spinner-indicator" animating={isSpinning} color={COLOR} size="large" />
    </>
  );
}

// Built in, no native module: the box and the checkmark are views
export function CanaryCheckbox() {
  const [isChecked, setIsChecked] = useState(false);
  return (
    <view className="switch-row">
      <text className="switch-label">{isChecked ? 'checkbox · checked' : 'checkbox · unchecked'}</text>
      <checkbox
        testID="canary-checkbox"
        value={isChecked}
        onValueChange={event => setIsChecked(event.value)}
        color={COLOR}
      />
    </view>
  );
}

// A third-party native view through the wrapper: the engine derives its events and tints
export function CanaryVolume() {
  const [volume, setVolume] = useState(0.5);
  return (
    <view className="section-tight">
      <text className="switch-label">{`volume · ${Math.round(volume * 100)}%`}</text>
      <Slider
        value={volume}
        onValueChange={setVolume}
        minimumValue={0}
        maximumValue={1}
        step={0.01}
        minimumTrackTintColor={COLOR}
        maximumTrackTintColor={TRACK_OFF}
        thumbTintColor="#ffffff"
        className="slider"
      />
    </view>
  );
}

// Static look in .pressable-card, only the press-dependent colors stay a style function
export function CanaryPressable({ onTap }: { onTap: () => void }) {
  return (
    <pressable
      onPress={onTap}
      className="pressable-card"
      style={({ pressed }) => ({
        backgroundColor: pressed ? '#0b1622' : '#13243a',
        borderColor: COLOR,
      })}
    >
      {({ pressed }) => (
        <text className="pressable-label" style={{ color: pressed ? COLOR : '#cbd5e1' }}>
          {pressed ? 'holding…' : 'press me (also +1)'}
        </text>
      )}
    </pressable>
  );
}
