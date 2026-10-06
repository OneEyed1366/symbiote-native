import { defineComponent, ref } from 'vue';
import { Slider } from '@symbiote-native/slider/vue';
import { ACCENT, INPUT_HINT, TRACK_OFF, TRACK_ON } from './canary-shared';

export const CanaryCounter = defineComponent<{ count: number; onTap: () => void }>(
  props => () => (
    <view testID="counter-card" onPress={props.onTap} class="counter-card">
      <text testID="counter-value" class="counter-text">
        {`tapped ${props.count}×`}
      </text>
    </view>
  ),
  { name: 'CanaryCounter', props: ['count', 'onTap'] },
);

// Shares the text-input tag with the keyboard-avoiding email field further down
export const CanaryGreeting = defineComponent({
  name: 'CanaryGreeting',
  setup() {
    const name = ref('');
    return () => (
      <>
        <text-input
          testID="greeting-input"
          value={name.value}
          onValueChange={event => {
            name.value = event.text;
          }}
          placeholder="type your name…"
          placeholderTextColor={INPUT_HINT}
          class="text-input"
        />
        <text testID="greeting-output" class="greeting">
          {name.value ? `Hello, ${name.value}` : 'Hello, stranger'}
        </text>
      </>
    );
  },
});

// The switch drives the ActivityIndicator below it
export const CanarySpinner = defineComponent({
  name: 'CanarySpinner',
  setup() {
    const isSpinning = ref(true);
    return () => (
      <>
        <view class="switch-row">
          <text class="switch-label">spinner</text>
          <switch
            testID="spinner-switch"
            value={isSpinning.value}
            onValueChange={event => {
              isSpinning.value = event.value;
            }}
            trackColor={{ false: TRACK_OFF, true: TRACK_ON }}
          />
        </view>
        <activity-indicator testID="spinner-indicator" animating={isSpinning.value} color={ACCENT} size="large" />
      </>
    );
  },
});

// Built in, no native module: the box and the checkmark are views
export const CanaryCheckbox = defineComponent({
  name: 'CanaryCheckbox',
  setup() {
    const isChecked = ref(false);
    return () => (
      <view class="switch-row">
        <text class="switch-label">{isChecked.value ? 'checkbox · checked' : 'checkbox · unchecked'}</text>
        <checkbox
          testID="canary-checkbox"
          value={isChecked.value}
          onValueChange={event => {
            isChecked.value = event.value;
          }}
          color={ACCENT}
        />
      </view>
    );
  },
});

// A third-party native view through the wrapper: the engine derives its events and tints
export const CanaryVolume = defineComponent({
  name: 'CanaryVolume',
  setup() {
    const volume = ref(0.5);
    return () => (
      <view class="section-tight">
        <text class="switch-label">{`volume · ${Math.round(volume.value * 100)}%`}</text>
        <Slider
          testID="volume-slider"
          value={volume.value}
          onValueChange={(next: number) => {
            volume.value = next;
          }}
          minimumValue={0}
          maximumValue={1}
          step={0.01}
          minimumTrackTintColor={ACCENT}
          maximumTrackTintColor={TRACK_OFF}
          thumbTintColor="#ffffff"
          class="slider"
        />
      </view>
    );
  },
});

// The tag resolves its own style per press, a child has no such channel and follows press events
export const CanaryPressable = defineComponent<{ onTap: () => void }>(
  props => {
    const isPressed = ref(false);
    return () => (
      <pressable
        onPress={props.onTap}
        onPressIn={() => {
          isPressed.value = true;
        }}
        onPressOut={() => {
          isPressed.value = false;
        }}
        class="pressable-card"
        style={({ pressed }) => ({
          backgroundColor: pressed ? '#2c3e50' : '#22323f',
          borderColor: pressed ? ACCENT : TRACK_ON,
        })}
      >
        <text class="pressable-label" style={{ color: isPressed.value ? ACCENT : '#cbd5e1' }}>
          {isPressed.value ? 'holding…' : 'press me (also +1)'}
        </text>
      </pressable>
    );
  },
  { name: 'CanaryPressable', props: ['onTap'] },
);
