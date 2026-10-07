<script lang="ts">
  import type { ISwitchChangeEvent, ITextInputChangeEvent } from '@symbiote-native/svelte';
  import { Slider } from '@symbiote-native/slider/svelte';
  import { ACCENT, HAIRLINE, PLACEHOLDER_COLOR } from './canary-shared';

  let name = $state('');
  let isSpinning = $state(true);
  let isChecked = $state(false);
  let volume = $state(0.5);
</script>

<text-input
  testID="greeting-input"
  value={name}
  onValueChange={(event: ITextInputChangeEvent) => (name = event.text)}
  placeholder="type your name…"
  placeholderTextColor={PLACEHOLDER_COLOR}
  class="text-input"
></text-input>
<text testID="greeting-output" class="greeting">{name ? `Hello, ${name}` : 'Hello, stranger'}</text>
<!-- The switch drives the ActivityIndicator below it -->
<view class="switch-row">
  <text class="switch-label">spinner</text>
  <switch
    testID="spinner-switch"
    value={isSpinning}
    onValueChange={(event: ISwitchChangeEvent) => (isSpinning = event.value)}
    trackColor={{ false: HAIRLINE, true: ACCENT }}
  />
</view>
<activity-indicator testID="spinner-indicator" animating={isSpinning} color={ACCENT} size="large" />
<!-- Built in, no native module: the box and the checkmark are views -->
<view class="switch-row">
  <text class="switch-label">{isChecked ? 'checkbox · checked' : 'checkbox · unchecked'}</text>
  <checkbox
    testID="canary-checkbox"
    value={isChecked}
    onValueChange={event => (isChecked = event.value)}
    color={ACCENT}
  ></checkbox>
</view>
<!-- A third-party native view through the wrapper: the engine derives its events and tints -->
<view class="section-tight">
  <text class="switch-label">{`volume · ${Math.round(volume * 100)}%`}</text>
  <Slider
    value={volume}
    onValueChange={next => (volume = next)}
    minimumValue={0}
    maximumValue={1}
    step={0.01}
    minimumTrackTintColor={ACCENT}
    maximumTrackTintColor={HAIRLINE}
    thumbTintColor="#ffffff"
    class="slider"
  />
</view>
