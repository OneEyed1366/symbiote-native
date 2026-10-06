import { createSignal } from 'solid-js';
import { KeyboardAvoidingView, Platform } from '@symbiote-native/solid';
import { INPUT_HINT, LOGO_URI, TRACK_OFF } from './canary-shared';

const GLOW_STYLE = { boxShadow: '0px 0px 22px 3px rgba(118,179,225,0.85)' };
const DARKEN_STYLE = { filter: [{ brightness: 0.5 }] };
const ROTATED_STYLE = { transformOrigin: 'top left', transform: [{ rotate: '4deg' }] };
const KEYBOARD_BEHAVIOR = Platform.OS === 'ios' ? 'padding' : 'height';
const KEYBOARD_TRACK_ON = '#2b6cb0';

// Modern style props reaching Fabric's C++ parser, each an A/B on the dark theme
export function CanaryStyleProps() {
  return (
    <>
      <view class="shadow-card" style={GLOW_STYLE}>
        <text class="note-text">boxShadow · glow</text>
      </view>
      <view class="row">
        <view class="filter-tile">
          <text class="tile-text">no filter</text>
        </view>
        <view class="filter-tile" style={DARKEN_STYLE}>
          <text class="tile-text">brightness 0.5</text>
        </view>
      </view>
      <view class="rotated-card" style={ROTATED_STYLE}>
        <text class="tile-text">transformOrigin · top-left</text>
      </view>
      {/* The gradient is authored in CanaryScreen.css and reaches Fabric through the css-parser */}
      <view class="gradient-card">
        <text class="tile-text">background-image · linear-gradient</text>
      </view>
      {/* PASS: the logo loads through the web alias fold and reads as "Solid logo" */}
      <image src={LOGO_URI} alt="Solid logo" width={48} height={48} class="web-image" />
    </>
  );
}

// PASS: with avoiding on, focusing the field lifts it above the email keyboard
export function CanaryKeyboardAvoiding() {
  const [isEnabled, setIsEnabled] = createSignal(true);
  return (
    <>
      <view class="switch-row">
        <text class="switch-label">avoid keyboard</text>
        <switch
          value={isEnabled()}
          onValueChange={event => setIsEnabled(event.value)}
          trackColor={{ false: TRACK_OFF, true: KEYBOARD_TRACK_ON }}
        />
      </view>
      <KeyboardAvoidingView behavior={KEYBOARD_BEHAVIOR} enabled={isEnabled()}>
        <text-input
          autoComplete="email"
          inputMode="email"
          enterKeyHint="done"
          placeholder="email — focus me near the bottom…"
          placeholderTextColor={INPUT_HINT}
          class="text-input"
        />
      </KeyboardAvoidingView>
    </>
  );
}
