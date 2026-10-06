import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from '@symbiote-native/react';
import { INPUT_HINT, TRACK_OFF } from './canary-shared';

const GLOW_STYLE = { boxShadow: '0px 0px 22px 3px rgba(20,158,202,0.85)' };
const DARKEN_STYLE = { filter: [{ brightness: 0.5 }] };
const ROTATED_STYLE = { transformOrigin: 'top left', transform: [{ rotate: '4deg' }] };
const LOGO_URI = 'https://reactnative.dev/img/tiny_logo.png';
const KEYBOARD_BEHAVIOR = Platform.OS === 'ios' ? 'padding' : 'height';
const KEYBOARD_TRACK_ON = '#2b6cb0';

// Modern style props reaching Fabric's C++ parser, each an A/B on the dark theme
export function CanaryStyleProps() {
  return (
    <>
      <view className="shadow-card" style={GLOW_STYLE}>
        <text className="note-text">boxShadow · glow</text>
      </view>
      <view className="row">
        <view className="filter-tile">
          <text className="tile-text">no filter</text>
        </view>
        <view className="filter-tile" style={DARKEN_STYLE}>
          <text className="tile-text">brightness 0.5</text>
        </view>
      </view>
      <view className="rotated-card" style={ROTATED_STYLE}>
        <text className="tile-text">transformOrigin · top-left</text>
      </view>
      {/* The gradient is authored in App.css and reaches Fabric through the css-parser */}
      <view className="gradient-card">
        <text className="tile-text">background-image · linear-gradient</text>
      </view>
      {/* PASS: the logo loads through the web alias fold and reads as "React logo" */}
      <image src={LOGO_URI} alt="React logo" width={48} height={48} className="web-image" />
    </>
  );
}

// PASS: with avoiding on, focusing the field lifts it above the email keyboard
export function CanaryKeyboardAvoiding() {
  const [isEnabled, setIsEnabled] = useState(true);
  return (
    <>
      <view className="switch-row">
        <text className="switch-label">avoid keyboard</text>
        <switch
          value={isEnabled}
          onValueChange={event => setIsEnabled(event.value)}
          trackColor={{ false: TRACK_OFF, true: KEYBOARD_TRACK_ON }}
        />
      </view>
      <KeyboardAvoidingView behavior={KEYBOARD_BEHAVIOR} enabled={isEnabled}>
        <text-input
          autoComplete="email"
          inputMode="email"
          enterKeyHint="done"
          placeholder="email — focus me near the bottom…"
          placeholderTextColor={INPUT_HINT}
          className="text-input"
        />
      </KeyboardAvoidingView>
    </>
  );
}
