import { defineComponent, ref } from 'vue';
import { KeyboardAvoidingView, Platform } from '@symbiote-native/vue';
import { INPUT_HINT, LOGO_URI, TRACK_OFF, TRACK_ON } from './canary-shared';

const GLOW_STYLE = { boxShadow: '0px 0px 22px 3px rgba(127,181,255,0.85)' };
const DARKEN_STYLE = { filter: [{ brightness: 0.5 }] };
const ROTATED_STYLE = { transformOrigin: 'top left', transform: [{ rotate: '4deg' }] };
const KEYBOARD_BEHAVIOR = Platform.OS === 'ios' ? 'padding' : 'height';

// Modern style props reaching Fabric's C++ parser, each an A/B on the dark theme
export const CanaryStyleProps = defineComponent({
  name: 'CanaryStyleProps',
  setup() {
    return () => (
      <>
        <view class="shadow-card" style={GLOW_STYLE}>
          <text class="note-text">boxShadow · blue glow</text>
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
        {/* The gradient is authored in App.css and reaches Fabric through the css-parser */}
        <view class="gradient-card">
          <text class="tile-text">background-image · linear-gradient</text>
        </view>
        {/* PASS: the logo loads through the web alias fold and reads as "Vue logo" */}
        <image src={LOGO_URI} alt="Vue logo" width={48} height={48} class="web-image" />
      </>
    );
  },
});

// PASS: with avoiding on, focusing the field lifts it above the email keyboard
export const CanaryKeyboardAvoiding = defineComponent({
  name: 'CanaryKeyboardAvoiding',
  setup() {
    const isEnabled = ref(true);
    return () => (
      <>
        <view class="switch-row">
          <text class="switch-label">avoid keyboard</text>
          <switch
            value={isEnabled.value}
            onValueChange={event => {
              isEnabled.value = event.value;
            }}
            trackColor={{ false: TRACK_OFF, true: TRACK_ON }}
          />
        </view>
        <KeyboardAvoidingView behavior={KEYBOARD_BEHAVIOR} enabled={isEnabled.value}>
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
  },
});
